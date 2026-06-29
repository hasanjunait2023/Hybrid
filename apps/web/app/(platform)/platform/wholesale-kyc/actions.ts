"use server";

// Super-admin Wholesale KYC Server Actions (Phase 5). Queries and mutates
// tenant KYC state for wholesale/B2B approval. Runs under asPlatformAdmin
// (BYPASSRLS) so reads/writes span every tenant.
import { asPlatformAdmin } from "@hybrid/db";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getPlatformAdmin } from "@/lib/platform/auth";

const TenantId = z.string().uuid();

export interface KycTenant {
  id: string;
  slug: string;
  name: string;
  ownerEmail: string | null;
  ownerName: string | null;
  kycStatus: string;
  kycDocumentsCount: number;
  businessType: string;
  createdAt: string;
}

export interface KycDocument {
  type: string;
  url: string;
  verified: boolean;
  uploadedAt?: string;
  [key: string]: unknown;
}

export interface KycDetail {
  id: string;
  slug: string;
  name: string;
  email: string | null;
  phone: string | null;
  businessType: string;
  kycStatus: string;
  wholesaleApproved: boolean;
  kycDocuments: KycDocument[];
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
}

export interface PlatformActionResult {
  ok: boolean;
  error?: string;
}

// List tenants pending KYC — wholesale/both business types, not yet approved.
export async function listPendingKycTenants(): Promise<KycTenant[]> {
  const rows = await asPlatformAdmin((tx) =>
    tx<
      {
        id: string;
        slug: string;
        name: string;
        owner_email: string | null;
        owner_name: string | null;
        kyc_status: string;
        kyc_documents: string;
        business_type: string;
        created_at: Date;
      }[]
    >`
      select
        t.id,
        t.slug,
        t.name,
        u.email                 as owner_email,
        u.full_name             as owner_name,
        t.kyc_status,
        t.kyc_documents::text,
        t.business_type::text,
        t.created_at
      from tenant t
      left join app_user u on u.id = t.owner_user_id
      where t.business_type in ('wholesale'::tenant_business_type, 'both'::tenant_business_type)
        and t.wholesale_approved = false
      order by t.created_at desc
    `,
  );

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    ownerEmail: r.owner_email,
    ownerName: r.owner_name,
    kycStatus: r.kyc_status,
    kycDocumentsCount: (() => {
      try {
        const docs = JSON.parse(r.kyc_documents);
        return Array.isArray(docs) ? docs.length : 0;
      } catch {
        return 0;
      }
    })(),
    businessType: r.business_type,
    createdAt: r.created_at.toISOString(),
  }));
}

// Approve KYC — sets wholesale_approved=true and kyc_status='verified'.
export async function approveKyc(tenantId: string): Promise<PlatformActionResult> {
  const admin = await getPlatformAdmin();
  if (!admin) return { ok: false, error: "অনুমতি নেই।" };

  const parsed = TenantId.safeParse(tenantId);
  if (!parsed.success) return { ok: false, error: "অবৈধ অনুরোধ।" };

  await asPlatformAdmin((tx) =>
    tx`
      update tenant
      set wholesale_approved = true,
          kyc_status = 'verified',
          updated_at = now()
      where id = ${parsed.data}
    `,
  );

  revalidatePath("/platform/wholesale-kyc");
  revalidatePath("/platform");
  return { ok: true };
}

// Reject KYC — sets kyc_status='rejected'.
export async function rejectKyc(tenantId: string): Promise<PlatformActionResult> {
  const admin = await getPlatformAdmin();
  if (!admin) return { ok: false, error: "অনুমতি নেই।" };

  const parsed = TenantId.safeParse(tenantId);
  if (!parsed.success) return { ok: false, error: "অবৈধ অনুরোধ।" };

  await asPlatformAdmin((tx) =>
    tx`
      update tenant
      set kyc_status = 'rejected',
          updated_at = now()
      where id = ${parsed.data}
    `,
  );

  revalidatePath("/platform/wholesale-kyc");
  revalidatePath("/platform");
  return { ok: true };
}

// Get full KYC detail for a single tenant.
export async function getKycDetail(tenantId: string): Promise<KycDetail | null> {
  const parsed = TenantId.safeParse(tenantId);
  if (!parsed.success) return null;

  const rows = await asPlatformAdmin((tx) =>
    tx<
      {
        id: string;
        slug: string;
        name: string;
        email: string | null;
        phone: string | null;
        business_type: string;
        kyc_status: string;
        wholesale_approved: boolean;
        kyc_documents: string;
        owner_name: string | null;
        owner_email: string | null;
        created_at: Date;
      }[]
    >`
      select
        t.id,
        t.slug,
        t.name,
        t.email,
        t.phone,
        t.business_type::text,
        t.kyc_status,
        t.wholesale_approved,
        t.kyc_documents::text,
        u.full_name             as owner_name,
        u.email                 as owner_email,
        t.created_at
      from tenant t
      left join app_user u on u.id = t.owner_user_id
      where t.id = ${parsed.data}
      limit 1
    `,
  );

  if (rows.length === 0) return null;

  const r = rows[0]!;
  let docs: KycDocument[] = [];
  try {
    const parsed = JSON.parse(r.kyc_documents);
    docs = Array.isArray(parsed) ? parsed : [];
  } catch {
    docs = [];
  }

  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    email: r.email,
    phone: r.phone,
    businessType: r.business_type,
    kycStatus: r.kyc_status,
    wholesaleApproved: r.wholesale_approved,
    kycDocuments: docs,
    ownerName: r.owner_name,
    ownerEmail: r.owner_email,
    createdAt: r.created_at.toISOString(),
  };
}
