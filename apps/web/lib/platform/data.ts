// Super-admin (platform) data layer (blueprint S-PLATFORM).
//
// Everything here is CROSS-TENANT, so it runs under asPlatformAdmin (NOT
// withTenant): the tenant directory, suspend/reactivate, and the membership
// lookup that impersonation needs all span tenants. asPlatformAdmin flips
// app.is_platform_admin so the reads/writes pass RLS (sql/02_policies.sql).
//
// Authorization is enforced by the caller (requirePlatformAdmin in
// lib/platform/auth.ts) BEFORE any of these run.
import { asPlatformAdmin } from "@hybrid/db";

export interface TenantDirectoryRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  planName: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  createdAt: string;
  trialEndsAt: string | null;
  subscriptionStatus: string | null;
  businessType: string;
}

// Every tenant, newest first. Joins owner (app_user), plan, and the live
// subscription so the operator sees the full lifecycle at a glance.
export async function listTenants(): Promise<TenantDirectoryRow[]> {
  const rows = await asPlatformAdmin((tx) =>
    tx<
      {
        id: string;
        slug: string;
        name: string;
        status: string;
        plan_name: string | null;
        owner_email: string | null;
        owner_name: string | null;
        created_at: Date;
        trial_ends_at: Date | null;
        subscription_status: string | null;
        business_type: string;
      }[]
    >`
      select
        t.id,
        t.slug,
        t.name,
        t.status,
        p.name                  as plan_name,
        u.email                 as owner_email,
        u.full_name             as owner_name,
        t.created_at,
        t.trial_ends_at,
        s.status                as subscription_status,
        t.business_type::text   as business_type
      from tenant t
      left join app_user u on u.id = t.owner_user_id
      left join plan p on p.id = t.plan_id
      left join lateral (
        select status
        from subscription
        where tenant_id = t.id
        order by created_at desc
        limit 1
      ) s on true
      order by t.created_at desc
    `,
  );

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    status: r.status,
    planName: r.plan_name,
    ownerEmail: r.owner_email,
    ownerName: r.owner_name,
    createdAt: r.created_at.toISOString(),
    trialEndsAt: r.trial_ends_at ? r.trial_ends_at.toISOString() : null,
    subscriptionStatus: r.subscription_status,
    businessType: r.business_type,
  }));
}

// Primary owner of a tenant — the identity impersonation issues a dev cookie
// for. Prefers the tenant.owner_user_id; falls back to the owner membership.
export async function getTenantOwnerUserId(tenantId: string): Promise<string | null> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ user_id: string }[]>`
      select coalesce(t.owner_user_id, m.user_id) as user_id
      from tenant t
      left join lateral (
        select user_id
        from tenant_member
        where tenant_id = t.id and role = 'owner' and accepted_at is not null
        order by created_at asc
        limit 1
      ) m on true
      where t.id = ${tenantId}
      limit 1
    `,
  );
  return rows[0]?.user_id ?? null;
}

// All verified domains for a tenant — needed to bust the host->tenant cache
// (resolve.ts keys by domain) after a status flip.
export async function getTenantDomains(tenantId: string): Promise<string[]> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ domain: string }[]>`
      select domain from tenant_domain where tenant_id = ${tenantId}
    `,
  );
  return rows.map((r) => r.domain);
}

export type TenantStatusFlip = "active" | "suspended";

// Flip tenant.status. Returns rows affected so the caller can detect a no-op
// (unknown tenant). suspended_at is stamped on suspend and cleared on
// reactivate for the audit trail. Idempotent: flipping to the current status
// still updates suspended_at/updated_at and returns 1.
export async function setTenantStatus(
  tenantId: string,
  status: TenantStatusFlip,
): Promise<number> {
  const suspendedAt = status === "suspended";
  const rows = await asPlatformAdmin((tx) =>
    tx<{ id: string }[]>`
      update tenant
      set status = ${status}::tenant_status,
          suspended_at = case when ${suspendedAt} then now() else null end,
          updated_at = now()
      where id = ${tenantId}
      returning id
    `,
  );
  return rows.length;
}
