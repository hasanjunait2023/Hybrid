// ============================================================================
// Returns / RTO / Exchange slice (tenant roadmap P1 #1). Runs against the same
// ephemeral embedded Postgres as the RLS gate, as the non-superuser
// app_runtime_login role (RLS FORCED). Exercises apps/web/lib/admin/returns.ts.
//
// Proves: createReturn inserts request+items; list/getReturn surface joins;
// received restocks tracked variants ONCE (idempotent); refunded stamps
// amount/method + stats; cross-tenant RLS isolation.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin, withTenant } from "../src/index";
import { placeOrder } from "../../../apps/web/lib/commerce/placeOrder";
import { getOrderDetail } from "../../../apps/web/lib/admin/orders";
import {
  listReturns,
  getReturn,
  getReturnStats,
  createReturn,
  updateReturnStatus,
} from "../../../apps/web/lib/admin/returns";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b";
const OWNER_A = "11111111-1111-1111-1111-111111111001";
const OWNER_B = "11111111-1111-1111-1111-111111111002";

const RET_PROD = "e0000009-0000-0000-0000-0000000000e9";
const RET_VAR = "f0000009-0000-0000-0000-0000000000f9";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from return_item where tenant_id = ${TENANT_A}`;
    await tx`delete from return_request where tenant_id = ${TENANT_A}`;
    await tx`delete from order_item where tenant_id = ${TENANT_A}`;
    await tx`delete from orders where tenant_id = ${TENANT_A}`;
    await tx`delete from order_counter where tenant_id = ${TENANT_A}`;
    await tx`delete from customer where tenant_id = ${TENANT_A} and phone = '01933000009'`;
    await tx`delete from product_variant where id = ${RET_VAR}`;
    await tx`delete from product where id = ${RET_PROD}`;
  });
}

async function stockOf(variantId: string): Promise<number> {
  return withTenant(TENANT_A, OWNER_A, async (tx) => {
    const r = await tx<{ q: number }[]>`
      select inventory_quantity as q from product_variant where id = ${variantId}
    `;
    return r[0]?.q ?? -1;
  });
}

describe("returns / RTO slice", () => {
  let orderId = "";
  let orderItemId = "";
  let returnId = "";

  beforeAll(async () => {
    await cleanup();
    await asPlatformAdmin(async (tx) => {
      await tx`
        insert into product (id, tenant_id, title, slug, status) values
          (${RET_PROD}, ${TENANT_A}, 'Return Test Tee', 'return-test-tee', 'active')
      `;
      await tx`
        insert into product_variant (id, tenant_id, product_id, title, sku, price, inventory_quantity, track_inventory) values
          (${RET_VAR}, ${TENANT_A}, ${RET_PROD}, 'M', 'RET-M', 700.00, 20, true)
      `;
    });

    const placed = await placeOrder({
      tenantId: TENANT_A,
      userId: OWNER_A,
      customer: { phone: "01933000009", name: "Return Tester" },
      items: [{ variantId: RET_VAR, quantity: 5 }],
      paymentMethod: "cod",
      source: "manual",
    });
    orderId = placed.orderId;

    const detail = await getOrderDetail(TENANT_A, OWNER_A, orderId);
    orderItemId = detail!.items[0]!.id;
  });

  afterAll(cleanup);

  it("1. createReturn inserts a request + items", async () => {
    const res = await createReturn(TENANT_A, OWNER_A, {
      orderId,
      type: "return",
      reason: "size_issue",
      note: "too small",
      items: [
        { orderItemId, variantId: RET_VAR, title: "Return Test Tee — M", quantity: 2, restock: true },
      ],
    });
    expect(res.id).toBeTruthy();
    returnId = res.id;

    const detail = await getReturn(TENANT_A, OWNER_A, returnId);
    expect(detail).not.toBeNull();
    expect(detail!.items).toHaveLength(1);
    expect(detail!.items[0]!.quantity).toBe(2);
    expect(detail!.status).toBe("requested");
  });

  it("2. listReturns surfaces it for the owning tenant", async () => {
    const list = await listReturns(TENANT_A, OWNER_A, {});
    const row = list.find((r) => r.id === returnId);
    expect(row).toBeDefined();
    expect(row!.orderId).toBe(orderId);
    expect(row!.itemCount).toBe(1);
  });

  it("3. received restocks tracked inventory exactly once (idempotent)", async () => {
    const before = await stockOf(RET_VAR);
    await updateReturnStatus(TENANT_A, OWNER_A, returnId, "received");
    expect(await stockOf(RET_VAR)).toBe(before + 2);

    const detail = await getReturn(TENANT_A, OWNER_A, returnId);
    expect(detail!.restocked).toBe(true);

    await updateReturnStatus(TENANT_A, OWNER_A, returnId, "received");
    expect(await stockOf(RET_VAR)).toBe(before + 2);
  });

  it("4. refunded stamps amount/method and shows in stats", async () => {
    await updateReturnStatus(TENANT_A, OWNER_A, returnId, "refunded", {
      refundAmount: 1400,
      refundMethod: "bkash",
    });
    const detail = await getReturn(TENANT_A, OWNER_A, returnId);
    expect(detail!.refundMethod).toBe("bkash");
    expect(detail!.refundAmount).toBe(1400);

    const stats = await getReturnStats(TENANT_A, OWNER_A);
    expect(stats.refundedThisMonth).toBeGreaterThanOrEqual(1);
    expect(stats.refundAmountThisMonth).toBeGreaterThanOrEqual(1400);
  });

  it("5. cross-tenant: tenant B cannot see tenant A's return (RLS)", async () => {
    const listB = await listReturns(TENANT_B, OWNER_B, {});
    expect(listB.find((r) => r.id === returnId)).toBeUndefined();
    const detailB = await getReturn(TENANT_B, OWNER_B, returnId);
    expect(detailB).toBeNull();
  });
});
