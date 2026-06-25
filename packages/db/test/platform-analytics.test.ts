// ============================================================================
// Platform analytics slice (tenant roadmap PP1-A1). Embedded Postgres. Exercises
// apps/web/lib/platform/analytics.ts — cross-tenant aggregates (asPlatformAdmin).
//
// Asserts RELATIVE deltas (the shared seed DB carries other tenants/orders), so
// the test is robust: add an active subscription on a known plan → MRR rises by
// exactly that plan's price; one new active tenant → active + total each +1.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import { getPlatformStats } from "../../../apps/web/lib/platform/analytics";

const PA_PLAN = "a1000001-0000-0000-0000-0000000a1001";
const PA_TENANT = "a1000002-0000-0000-0000-0000000a1002";
const PRICE = 2000;

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from subscription where tenant_id = ${PA_TENANT}`;
    await tx`delete from tenant where id = ${PA_TENANT}`;
    await tx`delete from plan where id = ${PA_PLAN}`;
  });
}

describe("platform analytics slice (PP1-A1)", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("MRR + tenant counts reflect a new active subscription", async () => {
    const before = await getPlatformStats();

    await asPlatformAdmin(async (tx) => {
      await tx`insert into plan (id, code, name, price_bdt, billing_interval)
               values (${PA_PLAN}, 'pa-test', 'PA Test', ${PRICE}, 'monthly')`;
      await tx`insert into tenant (id, name, slug, status, plan_id)
               values (${PA_TENANT}, 'PA Tenant', 'pa-tenant', 'active', ${PA_PLAN})`;
      await tx`insert into subscription (tenant_id, plan_id, status)
               values (${PA_TENANT}, ${PA_PLAN}, 'active')`;
    });

    const after = await getPlatformStats();
    expect(after.mrr).toBeCloseTo(before.mrr + PRICE, 2);
    expect(after.arr).toBeCloseTo(after.mrr * 12, 2);
    expect(after.tenants.active).toBe(before.tenants.active + 1);
    expect(after.tenants.total).toBe(before.tenants.total + 1);

    const planRow = after.mrrByPlan.find((p) => p.plan === "PA Test");
    expect(planRow?.mrr).toBe(PRICE);
  });

  it("returns a 14-day signup series", async () => {
    const s = await getPlatformStats();
    expect(s.signupSeries).toHaveLength(14);
  });
});
