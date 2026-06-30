"use server";

// Custom-domain Server Actions (blueprint §2.1, DESIGN §Q5). Self-hosted Caddy
// on VPS — verification is DNS-based (lib/domains/caddy.ts), NOT Vercel API.
//
// Flow: add → generate token + show DNS records → seller sets A + TXT at
// registrar → "Check Status" resolves TXT (ownership) then A (routing) →
// verified=true + ssl_status='issued' → Caddy ask gate returns 200 → Caddy
// auto-provisions Let's Encrypt cert on first HTTPS connection.
//
// Every action: getSession → tenant (membership) → withTenant write (RLS) →
// invalidateDomainCache when host routing changes so resolve.ts re-resolves.
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { withTenant } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { invalidateDomainCache } from "@/lib/tenant/resolve";
import { normalizeDomain } from "@/lib/domains/dns";
import { checkDomainDns } from "@/lib/domains/caddy";
import { checkPlanLimit } from "@/lib/platform/plans";
import {
  deriveDomainState,
  afterDnsVerified,
  afterSslIssued,
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
  verification_token: string | null;
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

  // Enforce plan limit before inserting (max_custom_domains per plan).
  const limit = await checkPlanLimit(auth.tenantId, "domain");
  if (!limit.allowed) {
    const cap = limit.limit === 0
      ? "আপনার প্ল্যানে কাস্টম ডোমেইন সাপোর্ট নেই। আপগ্রেড করুন।"
      : `আপনার প্ল্যানের সীমা (${limit.limit}টি) পূর্ণ হয়েছে। আপগ্রেড করুন।`;
    return { ok: false, error: cap };
  }

  // Generate a unique ownership-proof token stored in verification_token.
  // The seller must add a TXT record _hybrid-verify.{domain} = token at their
  // DNS provider before checkDomainStatus can advance the state.
  const token = randomUUID();

  let inserted = false;
  try {
    const rows = await withTenant(auth.tenantId, auth.userId, (tx) =>
      tx<{ id: string }[]>`
        insert into tenant_domain (tenant_id, domain, type, verified, ssl_status, verification_token)
        values (${auth.tenantId}, ${domain}, 'custom', false, 'none'::ssl_status, ${token})
        on conflict (domain) do nothing
        returning id
      `,
    );
    inserted = rows.length > 0;
  } catch {
    return { ok: false, error: "ডোমেইন যোগ করা যায়নি।" };
  }

  if (!inserted) {
    return { ok: false, error: "এই ডোমেইনটি ইতিমধ্যে অন্য একটি স্টোরে ব্যবহৃত হচ্ছে।" };
  }

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
        select id, domain, verified, ssl_status, verification_token
        from tenant_domain
        where id = ${id} and type = 'custom'
        limit 1
      `;
      const row = rows[0];
      if (!row) throw new Error("NOT_FOUND");
      if (!row.verification_token) throw new Error("NO_TOKEN");

      const prev = rowStatus(row);
      const dnsResult = await checkDomainDns(row.domain, row.verification_token);

      let next = prev;

      if (dnsResult.sslIssued) {
        // Both TXT (ownership) and A (routing) verified — domain is fully live.
        // Caddy's ask gate will return 200; cert auto-provisioned on first hit.
        next = afterSslIssued();
      } else if (dnsResult.txtVerified) {
        // Ownership proven but A record not pointing to us yet (or propagating).
        // Mark dns_verified so seller knows to wait for A record to propagate.
        next = afterDnsVerified(prev);
      }
      // If neither, stay at pending_dns — DNS may still be propagating; don't
      // mark failed to avoid frustrating sellers during normal propagation delays.

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
    if (error instanceof Error && error.message === "NO_TOKEN") {
      return { ok: false, error: "ডোমেইন টোকেন পাওয়া যায়নি — ডোমেইনটি সরিয়ে আবার যোগ করুন।" };
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
        select id, domain, verified, ssl_status, verification_token
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
