// ============================================================================
// Plans & limits slice (tenant roadmap PP1-A4). Embedded Postgres. Exercises
// apps/web/lib/platform/plans.ts (asPlatformAdmin).
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import {
  listPlans,
  createPlan,
  updatePlan,
  setPlanActive,
  checkPlanLimit,
} from "../../../apps/web/lib/platform/plans";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const LIM_PLAN = "a1000006-0000-0000-0000-0000000a1006";
const LIM_PROD = "e0000019-0000-0000-0000-000000000e19";

let originalPlanId: string | null = null;

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    // Restore TENANT_A's plan before deleting the test plan (FK is set-null).
    await tx`update tenant set plan_id = ${originalPlanId} where id = ${TENANT_A}`;
    await tx`delete from product where id = ${LIM_PROD}`;
    await tx`delete from plan where code in ('pl-crud', 'pl-limit')`;
    await tx`delete from plan where id = ${LIM_PLAN}`;
  });
}

describe("plans & limits slice (PP1-A4)", () => {
  beforeAll(async () => {
    const rows = await asPlatformAdmin((tx) =>
      tx<{ plan_id: string | null }[]>`select plan_id from tenant where id = ${TENANT_A}`,
    );
    originalPlanId = rows[0]?.plan_id ?? null;
    await cleanup();
  });
  afterAll(cleanup);

  it("1. create / update / deactivate a plan", async () => {
    const { id } = await createPlan({
      code: "pl-crud", name: "CRUD Plan", priceBdt: 500, billingInterval: "monthly",
      maxProducts: 10, maxOrdersMonth: 100, maxCustomDomains: 1, maxStaff: 2, isActive: true, sortOrder: 5,
    });
    let plans = await listPlans();
    let p = plans.find((x) => x.id === id);
    expect(p?.name).toBe("CRUD Plan");
    expect(p?.maxProducts).toBe(10);

    await updatePlan(id, {
      code: "pl-crud", name: "CRUD Plan v2", priceBdt: 750, billingInterval: "yearly",
      maxProducts: null, maxOrdersMonth: 200, maxCustomDomains: 2, maxStaff: 3, isActive: true, sortOrder: 5,
    });
    plans = await listPlans();
    p = plans.find((x) => x.id === id);
    expect(p?.name).toBe("CRUD Plan v2");
    expect(p?.priceBdt).toBe(750);
    expect(p?.maxProducts).toBeNull(); // unlimited

    await setPlanActive(id, false);
    plans = await listPlans();
    expect(plans.find((x) => x.id === id)?.isActive).toBe(false);
  });

  it("2. checkPlanLimit enforces the product cap", async () => {
    // A plan that allows exactly... count current products, set limit = that, expect blocked.
    const before = await checkPlanLimit(TENANT_A, "product");
    const cap = before.used; // set limit equal to current usage → next is blocked
    await asPlatformAdmin(async (tx) => {
      await tx`insert into plan (id, code, name, price_bdt, max_products) values (${LIM_PLAN}, 'pl-limit', 'Limit Plan', 0, ${cap})`;
      await tx`update tenant set plan_id = ${LIM_PLAN} where id = ${TENANT_A}`;
    });
    const atCap = await checkPlanLimit(TENANT_A, "product");
    expect(atCap.limit).toBe(cap);
    expect(atCap.allowed).toBe(false); // used >= limit

    // Raise the limit → allowed again.
    await asPlatformAdmin(async (tx) => {
      await tx`update plan set max_products = ${cap + 5} where id = ${LIM_PLAN}`;
    });
    const raised = await checkPlanLimit(TENANT_A, "product");
    expect(raised.allowed).toBe(true);
  });

  it("3. unlimited (null) limit always allowed", async () => {
    await asPlatformAdmin(async (tx) => {
      await tx`update plan set max_products = null where id = ${LIM_PLAN}`;
    });
    const r = await checkPlanLimit(TENANT_A, "product");
    expect(r.limit).toBeNull();
    expect(r.allowed).toBe(true);
  });
});
