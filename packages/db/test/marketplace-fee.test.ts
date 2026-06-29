// ============================================================================
// Wholesale marketplace MONTHLY FEE suite. Exercises the real platform fee data
// layer (apps/web/lib/platform/marketplaceFee.ts): configure a wholesaler's
// monthly fee, generate the period's billed lines (idempotently, fee>0 only),
// mark paid/waived, and roll up the summary. Platform tables via asPlatformAdmin.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import {
  setMonthlyFee,
  generateMonthlyFees,
  listWholesalerFees,
  setFeeStatus,
  getFeeSummary,
  monthStart,
} from "@/lib/platform/marketplaceFee";

// Two fresh wholesale tenants (isolated from the shared seed tenants so we never
// race other suites that filter by business_type).
const W_PAID = "facade00-0000-0000-0000-00000000fee1";
const W_FREE = "facade00-0000-0000-0000-00000000fee2";
const PERIOD = "2099-03"; // far-future month → no collision with other data

async function makeWholesaler(id: string, slug: string): Promise<void> {
  await asPlatformAdmin(
    (tx) => tx`
      insert into tenant (id, name, slug, status, business_type)
      values (${id}, ${`Fee Test ${slug}`}, ${slug}, 'active', 'wholesale')
      on conflict (id) do update set business_type = 'wholesale'
    `,
  );
}

describe("Wholesale marketplace monthly fee", () => {
  beforeAll(async () => {
    await asPlatformAdmin(async (tx) => {
      await tx`delete from marketplace_fee where tenant_id in (${W_PAID}, ${W_FREE})`;
      await tx`delete from tenant where id in (${W_PAID}, ${W_FREE})`;
    });
    await makeWholesaler(W_PAID, "fee-paid-co");
    await makeWholesaler(W_FREE, "fee-free-co");
  });

  afterAll(async () => {
    await asPlatformAdmin(async (tx) => {
      await tx`delete from marketplace_fee where tenant_id in (${W_PAID}, ${W_FREE})`;
      await tx`delete from tenant where id in (${W_PAID}, ${W_FREE})`;
    });
  });

  it("1. generate bills only wholesalers with a fee > 0", async () => {
    await setMonthlyFee(W_PAID, 1500);
    await setMonthlyFee(W_FREE, 0); // opted out → must NOT be billed

    const created = await generateMonthlyFees(PERIOD);
    expect(created).toBeGreaterThanOrEqual(1);

    const rows = await listWholesalerFees(PERIOD);
    const paid = rows.find((r) => r.tenantId === W_PAID);
    const free = rows.find((r) => r.tenantId === W_FREE);

    expect(paid?.monthlyFee).toBe(1500);
    expect(paid?.billedAmount).toBe(1500);
    expect(paid?.status).toBe("pending");

    // Configured but fee=0 → listed (it's a wholesaler) but no billed line.
    expect(free?.monthlyFee).toBe(0);
    expect(free?.feeId).toBeNull();
    expect(free?.status).toBeNull();
  });

  it("2. re-generating is idempotent — never double-bills", async () => {
    const before = await listWholesalerFees(PERIOD);
    const beforeRow = before.find((r) => r.tenantId === W_PAID);

    const createdAgain = await generateMonthlyFees(PERIOD);
    expect(createdAgain).toBe(0);

    const after = await asPlatformAdmin((tx) =>
      tx<{ n: string }[]>`
        select count(*)::bigint as n from marketplace_fee
         where tenant_id = ${W_PAID} and period_month = ${monthStart(PERIOD)}::date
      `,
    );
    expect(Number(after[0]?.n)).toBe(1);
    expect(beforeRow?.feeId).toBeTruthy();
  });

  it("3. marking paid stamps paid_at and feeds the collected total", async () => {
    const rows = await listWholesalerFees(PERIOD);
    const feeId = rows.find((r) => r.tenantId === W_PAID)?.feeId;
    expect(feeId).toBeTruthy();

    await setFeeStatus(feeId!, "paid");

    const row = await asPlatformAdmin((tx) =>
      tx<{ status: string; paid_at: string | null }[]>`
        select status, paid_at from marketplace_fee where id = ${feeId!}
      `,
    );
    expect(row[0]?.status).toBe("paid");
    expect(row[0]?.paid_at).not.toBeNull();

    const summary = await getFeeSummary(PERIOD);
    expect(summary.billed).toBe(1500);
    expect(summary.collected).toBe(1500);
    expect(summary.pending).toBe(0);
  });

  it("4. waiving clears paid_at and moves the amount out of collected", async () => {
    const rows = await listWholesalerFees(PERIOD);
    const feeId = rows.find((r) => r.tenantId === W_PAID)?.feeId;

    await setFeeStatus(feeId!, "waived");

    const row = await asPlatformAdmin((tx) =>
      tx<{ status: string; paid_at: string | null }[]>`
        select status, paid_at from marketplace_fee where id = ${feeId!}
      `,
    );
    expect(row[0]?.status).toBe("waived");
    expect(row[0]?.paid_at).toBeNull();

    const summary = await getFeeSummary(PERIOD);
    expect(summary.collected).toBe(0);
    expect(summary.waived).toBe(1500);
  });

  it("5. monthStart normalizes 'YYYY-MM' and full dates to first-of-month", () => {
    expect(monthStart("2099-03")).toBe("2099-03-01");
    expect(monthStart("2099-03-27")).toBe("2099-03-01");
    expect(() => monthStart("nope")).toThrow();
  });
});
