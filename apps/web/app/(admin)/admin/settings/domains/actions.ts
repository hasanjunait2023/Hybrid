"use server";

// Custom-domain Server Actions (blueprint §2.1, DESIGN §Q5). Add → verify/poll →
// set primary, all behind VERCEL_DOMAINS_ENABLED. Flag-off path is EXPLICIT
// PENDING: the row + DNS instructions are written, but the state never advances
// to verified/issued without a real Vercel signal. Domain ownership is never
// trusted from the client — the only way verified flips true is a live Vercel
// verify response (lib/domains/vercel.ts).
//
// Every action: getSession → tenant (membership) → withTenant write (RLS) →
// invalidateDomainCache when host routing changes so resolve.ts re-resolves.
import { revalidatePath } from "next/cache";
import { withTenant } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { invalidateDomainCache } from "@/lib/tenant/resolve";
import { normalizeDomain } from "@/lib/domains/dns";
import { addDomain, verifyDomain, getDomainStatus } from "@/lib/domains/vercel";
import {
  deriveDomainState,
  afterDnsVerified,
  afterSslIssued,
  asFailed,
  asRetry,
  routingChanged,
  type DomainRowStatus,
  type SslStatus,
} from "@/lib/domains/state";

export interface DomainActionResult {
  ok: boolean;
  error?: string;
}

async function authTenant(): Promise<
  { ok: true; tenantId: string; userId: string } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  return { ok: true, tenantId, userId: session.userId };
}

interface DomainRow {
  id: string;
  domain: string;
  verified: boolean;
  ssl_status: SslStatus;
}

function rowStatus(row: DomainRow): DomainRowStatus {
  return { verified: row.verified, sslStatus: row.ssl_status };
}

// ---- Add domain ------------------------------------------------------------
export async function addCustomDomain(
  _prev: DomainActionResult | null,
  formData: FormData,
): Promise<DomainActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const domain = normalizeDomain(String(formData.get("domain") ?? ""));
  if (!domain) {
    return { ok: false, error: "সঠিক ডোমেইন দিন (যেমন yourstore.com — http:// ছাড়া)।" };
  }

  // Register with Vercel first (flag-off → pending, no live call). The row is
  // persisted regardless so the DNS instructions render; verified stays false.
  const vercel = await addDomain(domain);
  const initialSsl: SslStatus = vercel.live && vercel.verified ? "pending" : "none";
  const initialVerified = vercel.live ? Boolean(vercel.verified) : false;

  try {
    await withTenant(auth.tenantId, auth.userId, (tx) =>
      tx`
        insert into tenant_domain (tenant_id, domain, type, verified, ssl_status)
        values (${auth.tenantId}, ${domain}, 'custom', ${initialVerified}, ${initialSsl}::ssl_status)
        on conflict (domain) do nothing
      `,
    );
  } catch {
    return { ok: false, error: "ডোমেইন যোগ করা যায়নি। হয়তো এটি ইতিমধ্যে ব্যবহৃত হচ্ছে।" };
  }

  if (initialVerified) await invalidateDomainCache(domain);
  revalidatePath("/admin/settings/domains");
  return { ok: true };
}

// ---- Verify / poll status --------------------------------------------------
export async function checkDomainStatus(
  _prev: DomainActionResult | null,
  formData: FormData,
): Promise<DomainActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "ডোমেইন পাওয়া যায়নি।" };

  let routingFlipped: string | null = null;

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      const rows = await tx<DomainRow[]>`
        select id, domain, verified, ssl_status
        from tenant_domain
        where id = ${id} and type = 'custom'
        limit 1
      `;
      const row = rows[0];
      if (!row) throw new Error("NOT_FOUND");

      const prev = rowStatus(row);

      // Drive the live calls (flag-off → live:false → no state change).
      const verifyRes = await verifyDomain(row.domain);
      let next = prev;

      if (verifyRes.live) {
        if (verifyRes.verified) {
          next = afterDnsVerified(prev);
          // Once DNS is verified, poll cert/config to learn if SSL is issued.
          const statusRes = await getDomainStatus(row.domain);
          if (statusRes.live && statusRes.sslIssued) next = afterSslIssued();
        } else {
          next = asFailed();
        }
      }

      if (next.verified !== prev.verified || next.sslStatus !== prev.sslStatus) {
        if (next.verified) {
          await tx`
            update tenant_domain
            set verified = true,
                ssl_status = ${next.sslStatus}::ssl_status,
                verified_at = now(),
                updated_at = now()
            where id = ${id}
          `;
        } else {
          await tx`
            update tenant_domain
            set verified = false,
                ssl_status = ${next.sslStatus}::ssl_status,
                updated_at = now()
            where id = ${id}
          `;
        }
      }
      if (routingChanged(prev, next)) routingFlipped = row.domain;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, error: "ডোমেইন পাওয়া যায়নি।" };
    }
    return { ok: false, error: "স্ট্যাটাস চেক করা যায়নি — আবার চেষ্টা করুন।" };
  }

  if (routingFlipped) await invalidateDomainCache(routingFlipped);
  revalidatePath("/admin/settings/domains");
  return { ok: true };
}

// ---- Retry a failed domain -------------------------------------------------
export async function retryDomain(
  _prev: DomainActionResult | null,
  formData: FormData,
): Promise<DomainActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "ডোমেইন পাওয়া যায়নি।" };

  const reset = asRetry();
  try {
    await withTenant(auth.tenantId, auth.userId, (tx) =>
      tx`
        update tenant_domain
        set verified = ${reset.verified}, ssl_status = ${reset.sslStatus}::ssl_status, updated_at = now()
        where id = ${id} and type = 'custom'
      `,
    );
  } catch {
    return { ok: false, error: "আবার চেষ্টা করা যায়নি।" };
  }
  revalidatePath("/admin/settings/domains");
  return { ok: true };
}

// ---- Set primary -----------------------------------------------------------
export async function setPrimaryDomain(
  _prev: DomainActionResult | null,
  formData: FormData,
): Promise<DomainActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "ডোমেইন পাওয়া যায়নি।" };

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      const rows = await tx<DomainRow[]>`
        select id, domain, verified, ssl_status
        from tenant_domain
        where id = ${id} and type = 'custom'
        limit 1
      `;
      const row = rows[0];
      if (!row) throw new Error("NOT_FOUND");
      // Only a genuinely live (ssl_issued) domain may be primary (DESIGN §Q5.2).
      if (deriveDomainState(rowStatus(row)) !== "ssl_issued") throw new Error("NOT_LIVE");

      // Single-primary invariant: clear the existing primary, then set this one.
      // tenant_domain_one_primary partial unique index enforces it at the DB.
      await tx`update tenant_domain set is_primary = false where is_primary = true`;
      await tx`update tenant_domain set is_primary = true, updated_at = now() where id = ${id}`;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_LIVE") {
      return { ok: false, error: "শুধু লাইভ (HTTPS) ডোমেইন প্রাইমারি করা যায়।" };
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, error: "ডোমেইন পাওয়া যায়নি।" };
    }
    return { ok: false, error: "প্রাইমারি করা যায়নি।" };
  }
  revalidatePath("/admin/settings/domains");
  return { ok: true };
}

// ---- Remove ----------------------------------------------------------------
export async function removeCustomDomain(
  _prev: DomainActionResult | null,
  formData: FormData,
): Promise<DomainActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "ডোমেইন পাওয়া যায়নি।" };

  let removed: string | null = null;
  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      const rows = await tx<{ domain: string; verified: boolean }[]>`
        delete from tenant_domain
        where id = ${id} and type = 'custom'
        returning domain, verified
      `;
      if (rows[0]?.verified) removed = rows[0].domain;
    });
  } catch {
    return { ok: false, error: "ডোমেইন সরানো যায়নি।" };
  }
  if (removed) await invalidateDomainCache(removed);
  revalidatePath("/admin/settings/domains");
  return { ok: true };
}
