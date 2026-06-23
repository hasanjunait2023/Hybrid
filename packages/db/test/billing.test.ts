// ============================================================================
// Billing state machine + sweep integration suite (Wave-3: S-BILLING).
//
// Two layers:
//   A. evaluateTenantBilling — the PURE state machine (status.ts). No DB; fixed
//      `now`. Covers every transition + grace boundary + terminal/no-period.
//   B. runBillingSweep — the sweep core (sweep.ts) against the SAME ephemeral
//      embedded Postgres as the RLS gate (global-setup.ts), as app_runtime_login
//      (RLS FORCED). Imports the cores from apps/web/lib/** — "@hybrid/db" is
//      aliased to its package source in vitest.config.ts. The host->tenant cache
//      buster is INJECTED (a spy) so the suite never touches Redis.
//
// Proves (blueprint "Sacred invariants" / GATE-1 14d trial + 3d grace):
//   1. trialing within trial -> stays trialing, no suspend.
//   2. trialing past trial end -> subscription flips to past_due, tenant stays
//      live (grace), no cache bust.
//   3. past_due within grace (< 3d) -> no change, no suspend.
//   4. past_due past grace (> 3d) -> tenant.status flips to 'suspended', cache
//      busted exactly once for that tenant.
//   5. active + cancelled subscriptions on other tenants are untouched / safe.
//
// Fresh fixture tenants (NOT the shared seed A/B) so other suites are unaffected.
// ============================================================================
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { asPlatformAdmin } from "../src/index";
import type { Tx } from "../src/index";
import { evaluateTenantBilling } from "../../../apps/web/lib/billing/status";
import { runBillingSweep } from "../../../apps/web/lib/billing/sweep";

// Dedicated billing-test tenants/users (distinct from seed A/B).
const OWNER = "11111111-1111-1111-1111-111111b11110";
const T_TRIAL_OK = "cccccccc-0000-0000-0000-00000000c001"; // trial, not expired
const T_TRIAL_EXP = "cccccccc-0000-0000-0000-00000000c002"; // trial expired -> past_due
const T_GRACE = "cccccccc-0000-0000-0000-00000000c003"; // past_due, in grace
const T_SUSPEND = "cccccccc-0000-0000-0000-00000000c004"; // past_due, grace gone -> suspend
const T_CANCELLED = "cccccccc-0000-0000-0000-00000000c005"; // cancelled, untouched

const ALL_TENANTS = [T_TRIAL_OK, T_TRIAL_EXP, T_GRACE, T_SUSPEND, T_CANCELLED];

const DAY = 24 * 60 * 60 * 1000;

async function planId(tx: Tx): Promise<string> {
  const rows = await tx<{ id: string }[]>`select id from plan where code = 'starter' limit 1`;
  return rows[0]!.id;
}

// Seed one tenant + its latest subscription. periodEndOffsetDays is relative to
// `now` (negative = already in the past). tenantStatus mirrors what provision /
// a prior sweep would have left.
async function seedTenant(
  tx: Tx,
  pid: string,
  id: string,
  tenantStatus: string,
  subStatus: string,
  periodEndOffsetDays: number,
): Promise<void> {
  await tx`
    insert into tenant (id, name, slug, status, owner_user_id, plan_id, trial_ends_at)
    values (
      ${id}, ${`Billing ${id.slice(-4)}`}, ${`billing-${id.slice(-4)}`},
      ${tenantStatus}::tenant_status,
      ${OWNER}, ${pid},
      now() + ${`${periodEndOffsetDays} days`}::interval
    )
  `;
  await tx`
    insert into tenant_domain (tenant_id, domain, type, is_primary, verified)
    values (${id}, ${`billing-${id.slice(-4)}.test`}, 'subdomain', true, true)
  `;
  await tx`
    insert into subscription (
      tenant_id, plan_id, status, current_period_start, current_period_end, billing_provider
    ) values (
      ${id}, ${pid}, ${subStatus}::subscription_status,
      now() - interval '14 days', now() + ${`${periodEndOffsetDays} days`}::interval, 'manual'
    )
  `;
}

async function seedFixtures(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await cleanup(tx);
    await tx`
      insert into app_user (id, email, full_name, is_platform_admin)
      values (${OWNER}, 'billing-owner@hybrid.local', 'Billing Owner', false)
      on conflict (id) do nothing
    `;
    const pid = await planId(tx);
    // periodEnd offsets relative to now (the sweep uses new Date()):
    await seedTenant(tx, pid, T_TRIAL_OK, "active", "trialing", +7); // 7d left
    await seedTenant(tx, pid, T_TRIAL_EXP, "active", "trialing", -1); // trial ended 1d ago
    await seedTenant(tx, pid, T_GRACE, "active", "past_due", -1); // grace day 1 of 3
    await seedTenant(tx, pid, T_SUSPEND, "active", "past_due", -5); // 5d past end -> grace gone
    await seedTenant(tx, pid, T_CANCELLED, "active", "cancelled", -30);
  });
}

async function cleanup(tx: Tx): Promise<void> {
  await tx`delete from subscription where tenant_id = any(${ALL_TENANTS})`;
  await tx`delete from tenant_domain where tenant_id = any(${ALL_TENANTS})`;
  await tx`delete from tenant where id = any(${ALL_TENANTS})`;
  await tx`delete from app_user where id = ${OWNER}`;
}

async function readTenantStatus(id: string): Promise<string | null> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ status: string }[]>`select status from tenant where id = ${id} limit 1`,
  );
  return rows[0]?.status ?? null;
}

async function readSubStatus(id: string): Promise<string | null> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ status: string }[]>`
      select status from subscription where tenant_id = ${id}
      order by created_at desc limit 1
    `,
  );
  return rows[0]?.status ?? null;
}

// ---------------------------------------------------------------------------
// A. Pure state machine
// ---------------------------------------------------------------------------
describe("evaluateTenantBilling (pure)", () => {
  const now = new Date("2026-06-23T00:00:00Z");
  const future = new Date(now.getTime() + 7 * DAY);
  const past = new Date(now.getTime() - 1 * DAY);

  it("trialing within trial -> stays trialing, no suspend", () => {
    const d = evaluateTenantBilling({ status: "trialing", currentPeriodEnd: future }, now);
    expect(d.status).toBe("trialing");
    expect(d.suspendTenant).toBe(false);
    expect(d.statusChanged).toBe(false);
    expect(d.reason).toBe("within_period");
  });

  it("trialing past trial end -> past_due, no suspend (grace starts)", () => {
    const d = evaluateTenantBilling({ status: "trialing", currentPeriodEnd: past }, now);
    expect(d.status).toBe("past_due");
    expect(d.suspendTenant).toBe(false);
    expect(d.statusChanged).toBe(true);
    expect(d.reason).toBe("trial_expired");
  });

  it("active past period end -> past_due", () => {
    const d = evaluateTenantBilling({ status: "active", currentPeriodEnd: past }, now);
    expect(d.status).toBe("past_due");
    expect(d.statusChanged).toBe(true);
    expect(d.reason).toBe("period_expired");
  });

  it("past_due within 3-day grace -> no change, no suspend", () => {
    const end = new Date(now.getTime() - 2 * DAY); // 2 days past end, grace = 3d
    const d = evaluateTenantBilling({ status: "past_due", currentPeriodEnd: end }, now);
    expect(d.suspendTenant).toBe(false);
    expect(d.statusChanged).toBe(false);
    expect(d.reason).toBe("in_grace");
  });

  it("past_due exactly at grace deadline -> still in grace (not suspended)", () => {
    const end = new Date(now.getTime() - 3 * DAY); // now == end + 3d
    const d = evaluateTenantBilling({ status: "past_due", currentPeriodEnd: end }, now);
    expect(d.suspendTenant).toBe(false);
    expect(d.reason).toBe("in_grace");
  });

  it("past_due beyond 3-day grace -> suspend tenant", () => {
    const end = new Date(now.getTime() - 4 * DAY); // 4 days past end > 3d grace
    const d = evaluateTenantBilling({ status: "past_due", currentPeriodEnd: end }, now);
    expect(d.suspendTenant).toBe(true);
    expect(d.status).toBe("past_due");
    expect(d.reason).toBe("grace_exhausted");
  });

  it("cancelled / expired -> terminal, never auto-transitions", () => {
    for (const status of ["cancelled", "expired"] as const) {
      const d = evaluateTenantBilling({ status, currentPeriodEnd: past }, now);
      expect(d.status).toBe(status);
      expect(d.suspendTenant).toBe(false);
      expect(d.reason).toBe("terminal");
    }
  });

  it("no period boundary -> holds current status", () => {
    const d = evaluateTenantBilling({ status: "trialing", currentPeriodEnd: null }, now);
    expect(d.statusChanged).toBe(false);
    expect(d.reason).toBe("no_period");
  });
});

// ---------------------------------------------------------------------------
// B. Sweep against the real DB
// ---------------------------------------------------------------------------
describe("runBillingSweep (integration)", () => {
  beforeAll(async () => {
    await seedFixtures();
  });

  afterEach(async () => {
    // Re-seed after the mutating sweep so each test starts from a known state.
    await seedFixtures();
  });

  it("flips expired trials to past_due and suspends grace-exhausted tenants once each", async () => {
    const busted: string[] = [];
    const bust = async (tenantId: string): Promise<void> => {
      busted.push(tenantId);
    };

    const result = await runBillingSweep(new Date(), bust);

    // 4 non-terminal subscriptions checked (cancelled excluded by the query).
    expect(result.checked).toBe(4);

    // Expired trial moved to past_due; the still-fresh trial untouched.
    expect(await readSubStatus(T_TRIAL_EXP)).toBe("past_due");
    expect(await readSubStatus(T_TRIAL_OK)).toBe("trialing");

    // Grace-exhausted tenant suspended; in-grace tenant stays live.
    expect(await readTenantStatus(T_SUSPEND)).toBe("suspended");
    expect(await readTenantStatus(T_GRACE)).toBe("active");
    expect(await readTenantStatus(T_TRIAL_EXP)).toBe("active"); // grace, not suspended

    // Suspension is reported and the cache busted exactly once for that tenant.
    expect(result.suspended).toEqual([T_SUSPEND]);
    expect(busted).toEqual([T_SUSPEND]);

    // past_due transitions reported (trial_exp this run).
    expect(result.pastDue).toContain(T_TRIAL_EXP);
    expect(result.errors).toBe(0);
  });

  it("suspending a tenant retires its subscription to terminal 'expired', unblocking re-signup", async () => {
    await runBillingSweep(new Date(), async () => {});

    // The suspended tenant's lapsed subscription is moved to a TERMINAL state so
    // subscription_one_active no longer counts it as live.
    expect(await readSubStatus(T_SUSPEND)).toBe("expired");
    expect(await readTenantStatus(T_SUSPEND)).toBe("suspended");

    // A fresh trialing subscription can now be inserted for that tenant — the
    // partial unique index (trialing/active/past_due) is no longer occupied.
    await asPlatformAdmin(async (tx) => {
      const pid = await planId(tx);
      await tx`
        insert into subscription (
          tenant_id, plan_id, status, current_period_start, current_period_end, billing_provider
        ) values (
          ${T_SUSPEND}, ${pid}, 'trialing'::subscription_status,
          now(), now() + interval '14 days', 'manual'
        )
      `;
    });
    expect(await readSubStatus(T_SUSPEND)).toBe("trialing");
  });

  it("cancelled subscriptions are never touched by the sweep", async () => {
    await runBillingSweep(new Date(), async () => {});
    expect(await readSubStatus(T_CANCELLED)).toBe("cancelled");
    expect(await readTenantStatus(T_CANCELLED)).toBe("active");
  });

  it("is idempotent: a second sweep suspends nothing new", async () => {
    const first = await runBillingSweep(new Date(), async () => {});
    expect(first.suspended).toEqual([T_SUSPEND]);

    const busted: string[] = [];
    const second = await runBillingSweep(new Date(), async (id) => {
      busted.push(id);
    });
    // T_SUSPEND already suspended -> not re-suspended, no cache bust.
    expect(second.suspended).toEqual([]);
    expect(busted).toEqual([]);
  });
});
