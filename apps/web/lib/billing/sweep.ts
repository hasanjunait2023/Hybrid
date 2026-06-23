// Billing sweep core (blueprint S-BILLING). Pure-ish orchestration around the
// pure state machine (status.ts) + the DB. Kept OUT of the route handler so the
// integration suite can drive it directly with a fixed `now` (no HTTP, no clock).
//
// For every tenant with a live subscription it:
//   1. reads the latest subscription (status + current_period_end)
//   2. runs evaluateTenantBilling(sub, now)
//   3. persists a changed subscription status (trialing/active -> past_due)
//   4. when grace is exhausted, flips tenant.status -> 'suspended', retires the
//      lapsed subscription to terminal 'expired' (so a future re-signup is not
//      blocked by subscription_one_active), and busts the host->tenant cache so
//      the storefront 404s on the next request
//
// All reads/writes are cross-tenant, so asPlatformAdmin (RLS via is_platform_admin).
// One tenant's failure never aborts the sweep.
import { asPlatformAdmin } from "@hybrid/db";
import { evaluateTenantBilling, type SubscriptionStatus } from "@/lib/billing/status";

export interface SweepResult {
  checked: number;
  suspended: string[];
  pastDue: string[];
  errors: number;
}

// Cache buster is injected so the integration suite can run without Redis. In
// the route it's bound to bustTenantDomainCache (lib/platform/cache.ts).
export type DomainCacheBuster = (tenantId: string) => Promise<void>;

interface SweepRow {
  tenant_id: string;
  tenant_status: string;
  sub_id: string;
  sub_status: SubscriptionStatus;
  current_period_end: Date | null;
}

export async function runBillingSweep(
  now: Date,
  bustCache: DomainCacheBuster,
): Promise<SweepResult> {
  // Only tenants with a non-terminal subscription are candidates. One row per
  // tenant (latest subscription), so the unique active-subscription invariant
  // (subscription_one_active) is respected.
  const rows = await asPlatformAdmin((tx) =>
    tx<SweepRow[]>`
      select
        t.id            as tenant_id,
        t.status        as tenant_status,
        s.id            as sub_id,
        s.status        as sub_status,
        s.current_period_end
      from tenant t
      join lateral (
        select id, status, current_period_end
        from subscription
        where tenant_id = t.id
        order by created_at desc
        limit 1
      ) s on true
      where s.status in ('trialing', 'active', 'past_due')
    `,
  );

  const result: SweepResult = { checked: 0, suspended: [], pastDue: [], errors: 0 };

  for (const row of rows) {
    result.checked += 1;
    try {
      const decision = evaluateTenantBilling(
        { status: row.sub_status, currentPeriodEnd: row.current_period_end },
        now,
      );

      // Persist a subscription status transition (e.g. trialing -> past_due).
      if (decision.statusChanged && decision.status !== row.sub_status) {
        await asPlatformAdmin((tx) =>
          tx`
            update subscription
            set status = ${decision.status}::subscription_status, updated_at = now()
            where id = ${row.sub_id}
          `,
        );
        if (decision.status === "past_due") result.pastDue.push(row.tenant_id);
      }

      // Grace exhausted -> suspend the tenant (only if not already suspended).
      if (decision.suspendTenant && row.tenant_status !== "suspended") {
        await asPlatformAdmin(async (tx) => {
          await tx`
            update tenant
            set status = 'suspended'::tenant_status,
                suspended_at = now(),
                updated_at = now()
            where id = ${row.tenant_id}
          `;
          // Retire the lapsed subscription to a TERMINAL state. subscription_one_active
          // only permits one trialing/active/past_due row per tenant; leaving it
          // 'past_due' forever would block a fresh trialing subscription if the
          // seller re-signs up. 'expired' (not 'cancelled' — that's a deliberate
          // user/admin action) marks an unpaid lapse and frees the partial index.
          await tx`
            update subscription
            set status = 'expired'::subscription_status, updated_at = now()
            where id = ${row.sub_id}
          `;
        });
        await bustCache(row.tenant_id);
        result.suspended.push(row.tenant_id);
      }
    } catch (error) {
      // One tenant's failure must not abort the sweep.
      result.errors += 1;
      console.error(`[billing-sweep] tenant ${row.tenant_id} failed`, error);
    }
  }

  return result;
}
