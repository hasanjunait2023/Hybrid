// DBID reviewer (S2.C5.v1 — platform admin side).
// Lists DBID submissions across all tenants, lets the platform team
// approve (issuing a DBID number) or reject (with notes).
//
// All reads use asPlatformAdmin() because the reviewer is acting across
// every tenant. Writes that flip status also write a row to audit_log
// via recordAudit() so the decision is traceable forever.
import { asPlatformAdmin } from "@hybrid/db";
import type { DbidStatus, BusinessType } from "@/lib/admin/dbid";

// Re-export the types other modules (page, client component) need.
export type { DbidStatus, BusinessType } from "@/lib/admin/dbid";

export interface DbidReviewRow {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  status: DbidStatus;
  step: 1 | 2 | 3 | 4;
  businessName: string | null;
  businessType: BusinessType | null;
  ownerFullName: string | null;
  ownerDob: string | null;
  nidLast4: string | null;
  tinLast4: string | null;
  tradeLicenseLast4: string | null;
  binLast4: string | null;
  dbidNumber: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  expiresAt: string | null;
  reviewerNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RawRow {
  id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  status: DbidStatus;
  step: number;
  business_name: string | null;
  business_type: string | null;
  owner_full_name: string | null;
  owner_dob: string | null;
  nid_last4: string | null;
  tin_last4: string | null;
  trade_license_last4: string | null;
  bin_last4: string | null;
  dbid_number: string | null;
  submitted_at: Date | null;
  reviewed_at: Date | null;
  expires_at: Date | null;
  reviewer_notes: string | null;
  created_at: Date;
  updated_at: Date;
}

function last4FromNumber(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const e = value as Record<string, unknown>;
  if (typeof e.last4 === "string") return e.last4;
  if (typeof e.number === "string" && e.number.length >= 4) {
    return `••••${e.number.slice(-4)}`;
  }
  return null;
}

// One row per tenant. We don't expose the sealed envelope contents — only
// last-4 hints. The full document is opened server-side only when needed
// (e.g. for a future a2i portal API integration).
 
function _rowToReview(r: RawRow): DbidReviewRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    tenantName: r.tenant_name,
    tenantSlug: r.tenant_slug,
    status: r.status,
    step: (Math.min(4, Math.max(1, r.step)) as 1 | 2 | 3 | 4),
    businessName: r.business_name,
    businessType:
      r.business_type === "proprietorship" ||
      r.business_type === "partnership" ||
      r.business_type === "ltd"
        ? r.business_type
        : null,
    ownerFullName: r.owner_full_name,
    ownerDob: r.owner_dob,
    nidLast4: r.nid_last4,
    tinLast4: r.tin_last4,
    tradeLicenseLast4: r.trade_license_last4,
    binLast4: r.bin_last4,
    dbidNumber: r.dbid_number,
    submittedAt: r.submitted_at ? r.submitted_at.toISOString() : null,
    reviewedAt: r.reviewed_at ? r.reviewed_at.toISOString() : null,
    expiresAt: r.expires_at ? r.expires_at.toISOString() : null,
    reviewerNotes: r.reviewer_notes,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

// Open the sealed envelope to its plaintext map. Used by the reviewer
// surface when we need the full document (e.g. for verification against
// the a2i portal). NOT exposed in the list view — that's last-4 only.
export interface DbidFullDocuments {
  nid: string | null;
  tin: string | null;
  tradeLicense: {
    number: string;
    issuedAt: string | null;
    expiresAt: string | null;
  } | null;
  bin: string | null;
}

// ---- Public API ----------------------------------------------------------

export interface DbidQueueFilters {
  status?: DbidStatus | "all";
  search?: string;
}

export async function listDbidQueue(
  filters: DbidQueueFilters = {},
): Promise<DbidReviewRow[]> {
  const { status = "submitted", search = "" } = filters;
  const searchLike = `%${search}%`;

  const rows = await asPlatformAdmin(async (tx) => {
    return await tx<
      {
        id: string;
        tenant_id: string;
        tenant_name: string;
        tenant_slug: string;
        status: DbidStatus;
        step: number;
        business_name: string | null;
        business_type: string | null;
        owner_full_name: string | null;
        owner_dob: string | null;
        nid_sealed: unknown;
        tin_sealed: unknown;
        trade_license_sealed: unknown;
        bin_sealed: unknown;
        dbid_number: string | null;
        submitted_at: Date | null;
        reviewed_at: Date | null;
        expires_at: Date | null;
        reviewer_notes: string | null;
        created_at: Date;
        updated_at: Date;
      }[]
    >`
      SELECT
        s.id, s.tenant_id, t.name AS tenant_name, t.slug AS tenant_slug,
        s.status, s.step,
        s.business_name, s.business_type, s.owner_full_name, s.owner_dob,
        s.nid_sealed, s.tin_sealed, s.trade_license_sealed, s.bin_sealed,
        s.dbid_number, s.submitted_at, s.reviewed_at, s.expires_at,
        s.reviewer_notes, s.created_at, s.updated_at
      FROM dbid_submission s
      JOIN tenant t ON t.id = s.tenant_id
      WHERE 1=1
        ${status === "all" ? tx`` : tx`AND s.status = ${status}`}
        ${search === "" ? tx`` : tx`AND (t.name ILIKE ${searchLike} OR t.slug ILIKE ${searchLike})`}
      ORDER BY
        CASE s.status
          WHEN 'submitted' THEN 0
          WHEN 'rejected' THEN 1
          WHEN 'in_progress' THEN 2
          WHEN 'approved' THEN 3
          ELSE 4
        END,
        s.submitted_at DESC NULLS LAST,
        s.created_at DESC
      LIMIT 200
    `;
  });

  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    tenantName: r.tenant_name,
    tenantSlug: r.tenant_slug,
    status: r.status,
    step: Math.min(4, Math.max(1, r.step)) as 1 | 2 | 3 | 4,
    businessName: r.business_name,
    businessType:
      r.business_type === "proprietorship" ||
      r.business_type === "partnership" ||
      r.business_type === "ltd"
        ? r.business_type
        : null,
    ownerFullName: r.owner_full_name,
    ownerDob: r.owner_dob,
    nidLast4: last4FromNumber(r.nid_sealed),
    tinLast4: last4FromNumber(r.tin_sealed),
    tradeLicenseLast4: last4FromNumber(r.trade_license_sealed),
    binLast4: last4FromNumber(r.bin_sealed),
    dbidNumber: r.dbid_number,
    submittedAt: r.submitted_at ? r.submitted_at.toISOString() : null,
    reviewedAt: r.reviewed_at ? r.reviewed_at.toISOString() : null,
    expiresAt: r.expires_at ? r.expires_at.toISOString() : null,
    reviewerNotes: r.reviewer_notes,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}

export async function getDbidForReview(
  submissionId: string,
): Promise<DbidReviewRow | null> {
  const rows = await asPlatformAdmin(async (tx) => {
    return await tx<
      {
        id: string;
        tenant_id: string;
        tenant_name: string;
        tenant_slug: string;
        status: DbidStatus;
        step: number;
        business_name: string | null;
        business_type: string | null;
        owner_full_name: string | null;
        owner_dob: string | null;
        nid_sealed: unknown;
        tin_sealed: unknown;
        trade_license_sealed: unknown;
        bin_sealed: unknown;
        dbid_number: string | null;
        submitted_at: Date | null;
        reviewed_at: Date | null;
        expires_at: Date | null;
        reviewer_notes: string | null;
        created_at: Date;
        updated_at: Date;
      }[]
    >`
      SELECT
        s.id, s.tenant_id, t.name AS tenant_name, t.slug AS tenant_slug,
        s.status, s.step,
        s.business_name, s.business_type, s.owner_full_name, s.owner_dob,
        s.nid_sealed, s.tin_sealed, s.trade_license_sealed, s.bin_sealed,
        s.dbid_number, s.submitted_at, s.reviewed_at, s.expires_at,
        s.reviewer_notes, s.created_at, s.updated_at
      FROM dbid_submission s
      JOIN tenant t ON t.id = s.tenant_id
      WHERE s.id = ${submissionId}
      LIMIT 1
    `;
  });

  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    tenantId: r.tenant_id,
    tenantName: r.tenant_name,
    tenantSlug: r.tenant_slug,
    status: r.status,
    step: Math.min(4, Math.max(1, r.step)) as 1 | 2 | 3 | 4,
    businessName: r.business_name,
    businessType:
      r.business_type === "proprietorship" ||
      r.business_type === "partnership" ||
      r.business_type === "ltd"
        ? r.business_type
        : null,
    ownerFullName: r.owner_full_name,
    ownerDob: r.owner_dob,
    nidLast4: last4FromNumber(r.nid_sealed),
    tinLast4: last4FromNumber(r.tin_sealed),
    tradeLicenseLast4: last4FromNumber(r.trade_license_sealed),
    binLast4: last4FromNumber(r.bin_sealed),
    dbidNumber: r.dbid_number,
    submittedAt: r.submitted_at ? r.submitted_at.toISOString() : null,
    reviewedAt: r.reviewed_at ? r.reviewed_at.toISOString() : null,
    expiresAt: r.expires_at ? r.expires_at.toISOString() : null,
    reviewerNotes: r.reviewer_notes,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

// Stats for the reviewer queue header.
export interface DbidQueueStats {
  submitted: number;
  in_progress: number;
  approved: number;
  rejected: number;
  total: number;
}

export async function getDbidQueueStats(): Promise<DbidQueueStats> {
  const rows = await asPlatformAdmin(async (tx) => {
    return await tx<
      { status: DbidStatus; count: number }[]
    >`SELECT status, count(*)::int AS count FROM dbid_submission GROUP BY status`;
  });
  const stats: DbidQueueStats = {
    submitted: 0,
    in_progress: 0,
    approved: 0,
    rejected: 0,
    total: 0,
  };
  for (const r of rows) {
    if (r.status === "submitted") stats.submitted = r.count;
    else if (r.status === "in_progress") stats.in_progress = r.count;
    else if (r.status === "approved") stats.approved = r.count;
    else if (r.status === "rejected") stats.rejected = r.count;
    stats.total += r.count;
  }
  return stats;
}