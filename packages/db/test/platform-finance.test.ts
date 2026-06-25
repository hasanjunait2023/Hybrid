// ============================================================================
// Platform finance slice (tenant roadmap PP1-B2). Embedded Postgres. Exercises
// apps/web/lib/platform/finance.ts (platform tables, asPlatformAdmin).
//
// Relative deltas (shared DB): a known paid invoice raises revenue by its amount,
// a known expense raises expenses by its amount, net = revenue − expenses.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import {
  getFinanceOverview,
  listExpenses,
  addExpense,
  deleteExpense,
  type FinanceRange,
} from "../../../apps/web/lib/platform/finance";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const PF_INVOICE = "a1000007-0000-0000-0000-0000000a1007";
const REVENUE = 5000;
const EXPENSE = 1200;

function todayDhaka(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
}
const RANGE: FinanceRange = { from: todayDhaka(), to: todayDhaka() };

let expenseId = "";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from invoice where id = ${PF_INVOICE}`;
    await tx`delete from platform_expense where note = 'pf-test-marker'`;
  });
}

describe("platform finance slice (PP1-B2)", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("1. revenue (paid invoice) − expense = net profit", async () => {
    const before = await getFinanceOverview(RANGE);

    await asPlatformAdmin(async (tx) => {
      await tx`insert into invoice (id, tenant_id, amount, status, paid_at)
               values (${PF_INVOICE}, ${TENANT_A}, ${REVENUE}, 'paid', now())`;
    });
    ({ id: expenseId } = await addExpense({ category: "infra", vendor: "VPS", amount: EXPENSE, note: "pf-test-marker", incurredOn: todayDhaka() }));

    const after = await getFinanceOverview(RANGE);
    expect(after.revenue).toBeCloseTo(before.revenue + REVENUE, 2);
    expect(after.expenses).toBeCloseTo(before.expenses + EXPENSE, 2);
    expect(after.netProfit).toBeCloseTo(after.revenue - after.expenses, 2);

    const infra = after.expenseByCategory.find((c) => c.category === "infra");
    expect(infra?.amount).toBeGreaterThanOrEqual(EXPENSE);
  });

  it("2. listExpenses includes it; delete removes it", async () => {
    const list = await listExpenses(RANGE);
    expect(list.find((e) => e.id === expenseId)).toBeDefined();

    await deleteExpense(expenseId);
    const after = await listExpenses(RANGE);
    expect(after.find((e) => e.id === expenseId)).toBeUndefined();
  });

  it("3. rejects a negative expense amount", async () => {
    await expect(addExpense({ category: "other", amount: -5, note: "pf-test-marker", incurredOn: todayDhaka() })).rejects.toThrow();
  });
});
