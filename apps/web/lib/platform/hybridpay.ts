// Platform Hybrid Pay console — data layer. Super-admin view over every
// tenant's Hybrid Pay onboarding state + money flow, so the founder can run the
// one manual onboarding step (brand + API key + domain whitelist in the
// PipraPay admin) and then watch payments actually land.
//
// asPlatformAdmin — cross-tenant by design (founder ops console, not a tenant
// surface). Credentials are NEVER read here — only existence/enabled flags.
import { asPlatformAdmin } from "@hybrid/db";

export interface HybridpayOverview {
  /** Tenants with a hybridpay payment_account row (any state). */
  configured: number;
  /** Tenants with hybridpay enabled (can take payments now). */
  enabled: number;
  /** Live-ish tenants (trial/active/past_due) with NO hybridpay row yet. */
  awaitingOnboarding: number;
  /** All-time settled volume through Hybrid Pay (BDT). */
  successVolume: number;
  /** Settled payments in the last 30 days (count / BDT). */
  success30dCount: number;
  success30dVolume: number;
  /** Failed or amount-mismatch payments in the last 30 days (needs attention). */
  failed30dCount: number;
}

export interface HybridpayTenantRow {
  tenantId: string;
  tenantName: string;
  slug: string;
  tenantStatus: string;
  /** null = no payment_account row yet (founder hasn't onboarded the brand). */
  accountEnabled: boolean | null;
  accountCreatedAt: string | null;
  /** Primary verified domain — what must be whitelisted in the PipraPay brand. */
  webhookDomain: string | null;
  successCount: number;
  successVolume: number;
  pendingCount: number;
  failedCount: number;
  lastPaidAt: string | null;
}

export interface HybridpayPaymentRow {
  paymentId: string;
  tenantName: string;
  orderNumber: number | null;
  amount: number;
  status: string;
  providerRef: string | null;
  createdAt: string;
  paidAt: string | null;
}

export async function getHybridpayOverview(): Promise<HybridpayOverview> {
  return asPlatformAdmin(async (tx) => {
    const acct = await tx<{ configured: number; enabled: number; awaiting: number }[]>`
      select
        count(pa.id)::int as configured,
        count(pa.id) filter (where pa.is_enabled)::int as enabled,
        count(t.id) filter (
          where pa.id is null and t.status in ('trial', 'active', 'past_due')
        )::int as awaiting
      from tenant t
      left join payment_account pa
        on pa.tenant_id = t.id and pa.provider = 'hybridpay'
    `;
    const pay = await tx<
      { vol_all: string; n_30: number; vol_30: string; failed_30: number }[]
    >`
      select
        coalesce(sum(amount) filter (where status = 'success'), 0) as vol_all,
        count(*) filter (where status = 'success' and created_at > now() - interval '30 days')::int as n_30,
        coalesce(sum(amount) filter (where status = 'success' and created_at > now() - interval '30 days'), 0) as vol_30,
        count(*) filter (where status in ('failed', 'cancelled') and created_at > now() - interval '30 days')::int as failed_30
      from payment
      where provider = 'hybridpay'
    `;
    return {
      configured: acct[0]?.configured ?? 0,
      enabled: acct[0]?.enabled ?? 0,
      awaitingOnboarding: acct[0]?.awaiting ?? 0,
      successVolume: Number(pay[0]?.vol_all ?? 0),
      success30dCount: pay[0]?.n_30 ?? 0,
      success30dVolume: Number(pay[0]?.vol_30 ?? 0),
      failed30dCount: pay[0]?.failed_30 ?? 0,
    };
  });
}

export async function listHybridpayTenants(): Promise<HybridpayTenantRow[]> {
  const rows = await asPlatformAdmin((tx) =>
    tx<
      {
        tenant_id: string;
        tenant_name: string;
        slug: string;
        tenant_status: string;
        account_enabled: boolean | null;
        account_created_at: string | null;
        webhook_domain: string | null;
        success_count: number;
        success_volume: string;
        pending_count: number;
        failed_count: number;
        last_paid_at: string | null;
      }[]
    >`
      select
        t.id           as tenant_id,
        t.name         as tenant_name,
        t.slug         as slug,
        t.status::text as tenant_status,
        pa.is_enabled  as account_enabled,
        pa.created_at  as account_created_at,
        (
          select td.domain from tenant_domain td
          where td.tenant_id = t.id and td.verified = true
          order by td.is_primary desc, (td.type = 'custom') desc, td.created_at asc
          limit 1
        ) as webhook_domain,
        coalesce(p.success_count, 0)::int  as success_count,
        coalesce(p.success_volume, 0)      as success_volume,
        coalesce(p.pending_count, 0)::int  as pending_count,
        coalesce(p.failed_count, 0)::int   as failed_count,
        p.last_paid_at                     as last_paid_at
      from tenant t
      left join payment_account pa
        on pa.tenant_id = t.id and pa.provider = 'hybridpay'
      left join lateral (
        select
          count(*) filter (where status = 'success')                as success_count,
          sum(amount) filter (where status = 'success')             as success_volume,
          count(*) filter (where status = 'pending')                as pending_count,
          count(*) filter (where status in ('failed', 'cancelled')) as failed_count,
          max(paid_at)                                              as last_paid_at
        from payment
        where tenant_id = t.id and provider = 'hybridpay'
      ) p on true
      where t.status in ('trial', 'active', 'past_due', 'suspended')
      order by (pa.id is not null) desc, t.created_at asc
    `,
  );
  return rows.map((r) => ({
    tenantId: r.tenant_id,
    tenantName: r.tenant_name,
    slug: r.slug,
    tenantStatus: r.tenant_status,
    accountEnabled: r.account_enabled,
    accountCreatedAt: r.account_created_at,
    webhookDomain: r.webhook_domain,
    successCount: r.success_count,
    successVolume: Number(r.success_volume),
    pendingCount: r.pending_count,
    failedCount: r.failed_count,
    lastPaidAt: r.last_paid_at,
  }));
}

export async function listRecentHybridpayPayments(limit = 30): Promise<HybridpayPaymentRow[]> {
  const n = Math.max(1, Math.min(100, Math.trunc(limit)));
  const rows = await asPlatformAdmin((tx) =>
    tx<
      {
        payment_id: string;
        tenant_name: string;
        order_number: string | null;
        amount: string;
        status: string;
        provider_ref: string | null;
        created_at: string;
        paid_at: string | null;
      }[]
    >`
      select
        p.id            as payment_id,
        t.name          as tenant_name,
        o.order_number  as order_number,
        p.amount        as amount,
        p.status::text  as status,
        p.provider_ref  as provider_ref,
        p.created_at    as created_at,
        p.paid_at       as paid_at
      from payment p
      join tenant t on t.id = p.tenant_id
      left join orders o on o.id = p.order_id
      where p.provider = 'hybridpay'
      order by p.created_at desc
      limit ${n}
    `,
  );
  return rows.map((r) => ({
    paymentId: r.payment_id,
    tenantName: r.tenant_name,
    orderNumber: r.order_number == null ? null : Number(r.order_number),
    amount: Number(r.amount),
    status: r.status,
    providerRef: r.provider_ref,
    createdAt: r.created_at,
    paidAt: r.paid_at,
  }));
}
