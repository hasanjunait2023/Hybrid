// ============================================================================
// COD fraud / phone-blocklist slice (tenant roadmap P1 #2). Embedded Postgres,
// app_runtime_login role (RLS FORCED). Exercises apps/web/lib/admin/fraud.ts.
//
// Proves: block/unblock + isPhoneBlocked; getOrderRiskSignals computes prior
// cancels/returns + duplicate-recent + rtoRate from the tenant's own history;
// cross-tenant RLS isolation of the blocklist.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import { placeOrder } from "../../../apps/web/lib/commerce/placeOrder";
import {
  blockPhone,
  unblockPhone,
  isPhoneBlocked,
  listBlocklist,
  getOrderRiskSignals,
} from "../../../apps/web/lib/admin/fraud";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b";
const OWNER_A = "11111111-1111-1111-1111-111111111001";
const OWNER_B = "11111111-1111-1111-1111-111111111002";

const FR_PROD = "e0000010-0000-0000-0000-000000000e10";
const FR_VAR = "f0000010-0000-0000-0000-000000000f10";
const PHONE = "01955000010";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from phone_blocklist where tenant_id in (${TENANT_A}, ${TENANT_B})`;
    await tx`delete from order_item where tenant_id = ${TENANT_A}`;
    await tx`delete from orders where tenant_id = ${TENANT_A}`;
    await tx`delete from order_counter where tenant_id = ${TENANT_A}`;
    await tx`delete from customer where tenant_id = ${TENANT_A} and phone = ${PHONE}`;
    await tx`delete from product_variant where id = ${FR_VAR}`;
    await tx`delete from product where id = ${FR_PROD}`;
  });
}

const ADDR = {
  recipient: "Fraud Tester",
  phone: PHONE,
  division: "Dhaka",
  district: "Dhaka",
  thana: "Mirpur",
  line: "House 1",
};

async function order(): Promise<string> {
  const r = await placeOrder({
    tenantId: TENANT_A,
    userId: OWNER_A,
    customer: { phone: PHONE, name: "Fraud Tester" },
    shippingAddress: ADDR,
    items: [{ variantId: FR_VAR, quantity: 1 }],
    paymentMethod: "cod",
    source: "manual",
  });
  return r.orderId;
}

describe("fraud / phone-blocklist slice", () => {
  let firstOrder = "";
  let currentOrder = "";

  beforeAll(async () => {
    await cleanup();
    await asPlatformAdmin(async (tx) => {
      await tx`
        insert into product (id, tenant_id, title, slug, status) values
          (${FR_PROD}, ${TENANT_A}, 'Fraud Test Item', 'fraud-test-item', 'active')
      `;
      await tx`
        insert into product_variant (id, tenant_id, product_id, title, sku, price, inventory_quantity, track_inventory) values
          (${FR_VAR}, ${TENANT_A}, ${FR_PROD}, 'M', 'FR-M', 500.00, 50, true)
      `;
    });
    firstOrder = await order();
    currentOrder = await order();
    // Mark the first order cancelled so it counts as a prior bad order.
    await asPlatformAdmin(async (tx) => {
      await tx`update orders set fulfillment_status = 'cancelled' where id = ${firstOrder}`;
    });
  });

  afterAll(cleanup);

  it("1. block / isPhoneBlocked / listBlocklist / unblock", async () => {
    expect(await isPhoneBlocked(TENANT_A, OWNER_A, PHONE)).toBe(false);
    await blockPhone(TENANT_A, OWNER_A, PHONE, "repeat canceller");
    expect(await isPhoneBlocked(TENANT_A, OWNER_A, PHONE)).toBe(true);

    const list = await listBlocklist(TENANT_A, OWNER_A);
    expect(list.find((r) => r.phone === PHONE)?.reason).toBe("repeat canceller");

    // Idempotent re-block updates the reason, not a duplicate row.
    await blockPhone(TENANT_A, OWNER_A, PHONE, "fake orders");
    const list2 = await listBlocklist(TENANT_A, OWNER_A);
    expect(list2.filter((r) => r.phone === PHONE)).toHaveLength(1);

    await unblockPhone(TENANT_A, OWNER_A, PHONE);
    expect(await isPhoneBlocked(TENANT_A, OWNER_A, PHONE)).toBe(false);
  });

  it("2. getOrderRiskSignals computes prior + duplicate signals", async () => {
    const risk = await getOrderRiskSignals(TENANT_A, OWNER_A, currentOrder);
    expect(risk.phone).toBe(PHONE);
    expect(risk.priorOrders).toBe(1); // the first order, excluding current
    expect(risk.priorCancelled).toBe(1);
    expect(risk.rtoRate).toBeCloseTo(1, 5);
    expect(risk.duplicateRecent).toBeGreaterThanOrEqual(1); // both placed within 24h
  });

  it("3. blocked flag reflects the blocklist", async () => {
    await blockPhone(TENANT_A, OWNER_A, PHONE, "x");
    const risk = await getOrderRiskSignals(TENANT_A, OWNER_A, currentOrder);
    expect(risk.blocked).toBe(true);
    await unblockPhone(TENANT_A, OWNER_A, PHONE);
  });

  it("4. cross-tenant: tenant B cannot see tenant A's blocklist (RLS)", async () => {
    await blockPhone(TENANT_A, OWNER_A, PHONE, "A only");
    expect(await isPhoneBlocked(TENANT_B, OWNER_B, PHONE)).toBe(false);
    const listB = await listBlocklist(TENANT_B, OWNER_B);
    expect(listB.find((r) => r.phone === PHONE)).toBeUndefined();
    await unblockPhone(TENANT_A, OWNER_A, PHONE);
  });
});
