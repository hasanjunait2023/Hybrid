// ============================================================================
// Loyalty points slice (tenant roadmap P3-2). Embedded Postgres,
// app_runtime_login (RLS). Exercises apps/web/lib/admin/loyalty.ts.
//
// Proves: program upsert; earn computes points + is idempotent per order;
// balance = ledger sum; redeem validates balance + returns taka value; disabled
// program earns nothing; cross-tenant RLS.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import {
  getProgram,
  updateProgram,
  getBalance,
  awardForOrder,
  redeem,
} from "../../../apps/web/lib/admin/loyalty";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b";
const OWNER_A = "11111111-1111-1111-1111-111111111001";
const OWNER_B = "11111111-1111-1111-1111-111111111002";

const CUST = "d0000016-0000-0000-0000-000000000d16";
const ORD = "c0000016-0000-0000-0000-000000000c16";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from loyalty_ledger where tenant_id = ${TENANT_A}`;
    await tx`delete from loyalty_program where tenant_id = ${TENANT_A}`;
    await tx`delete from orders where id = ${ORD}`;
    await tx`delete from customer where id = ${CUST}`;
  });
}

describe("loyalty points slice (P3-2)", () => {
  beforeAll(async () => {
    await cleanup();
    await asPlatformAdmin(async (tx) => {
      await tx`insert into customer (id, tenant_id, name, phone, orders_count) values
        (${CUST}, ${TENANT_A}, 'Loyal C', '01999000016', 2)`;
      await tx`insert into orders (id, tenant_id, customer_id, grand_total, payment_status, fulfillment_status)
        values (${ORD}, ${TENANT_A}, ${CUST}, 1000, 'paid', 'delivered')`;
    });
  });

  afterAll(cleanup);

  it("1. program upsert + disabled earns nothing", async () => {
    expect((await getProgram(TENANT_A, OWNER_A)).enabled).toBe(false);
    // Disabled → no points.
    expect(await awardForOrder(TENANT_A, OWNER_A, CUST, ORD, 1000)).toBe(0);

    await updateProgram(TENANT_A, OWNER_A, { enabled: true, earnPer100: 2, takaPerPoint: 1 });
    const p = await getProgram(TENANT_A, OWNER_A);
    expect(p.enabled).toBe(true);
    expect(p.earnPer100).toBe(2);
  });

  it("2. earn computes points + is idempotent per order", async () => {
    // 1000/100 * 2 = 20 points.
    expect(await awardForOrder(TENANT_A, OWNER_A, CUST, ORD, 1000)).toBe(20);
    expect(await getBalance(TENANT_A, OWNER_A, CUST)).toBe(20);
    // Re-award same order → no-op (earn-once unique index).
    expect(await awardForOrder(TENANT_A, OWNER_A, CUST, ORD, 1000)).toBe(0);
    expect(await getBalance(TENANT_A, OWNER_A, CUST)).toBe(20);
  });

  it("3. redeem validates balance + returns taka value", async () => {
    await expect(redeem(TENANT_A, OWNER_A, CUST, 50)).rejects.toThrow(); // > balance
    const res = await redeem(TENANT_A, OWNER_A, CUST, 15);
    expect(res.takaValue).toBe(15); // 15 * 1 taka
    expect(res.balance).toBe(5);
    expect(await getBalance(TENANT_A, OWNER_A, CUST)).toBe(5);
  });

  it("4. cross-tenant: tenant B sees no balance for A's customer (RLS)", async () => {
    expect(await getBalance(TENANT_B, OWNER_B, CUST)).toBe(0);
  });
});
