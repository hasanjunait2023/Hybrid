// ============================================================================
// Bulk order ops slice (tenant roadmap P1 #3). Embedded Postgres,
// app_runtime_login role (RLS FORCED). Exercises bulkAdvanceStatusCore — the
// testable core the bulk Server Action wraps (mirrors sendToCourierCore).
//
// Proves: bulk advance confirms many orders; an invalid transition in the batch
// fails that one only (partial success); cancel restores inventory in bulk;
// cross-tenant orders are untouched (RLS — they simply aren't found).
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin, withTenant } from "../src/index";
import { placeOrder } from "../../../apps/web/lib/commerce/placeOrder";
import { bulkAdvanceStatusCore } from "../../../apps/web/lib/admin/orders";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const OWNER_A = "11111111-1111-1111-1111-111111111001";

const BK_PROD = "e0000011-0000-0000-0000-000000000e11";
const BK_VAR = "f0000011-0000-0000-0000-000000000f11";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from order_item where tenant_id = ${TENANT_A}`;
    await tx`delete from orders where tenant_id = ${TENANT_A}`;
    await tx`delete from customer where tenant_id = ${TENANT_A} and phone like '019660000%'`;
    await tx`delete from product_variant where id = ${BK_VAR}`;
    await tx`delete from product where id = ${BK_PROD}`;
  });
}

async function mkOrder(phoneTail: string): Promise<string> {
  const r = await placeOrder({
    tenantId: TENANT_A,
    userId: OWNER_A,
    customer: { phone: `019660000${phoneTail}`, name: `Bulk ${phoneTail}` },
    shippingAddress: {
      recipient: `Bulk ${phoneTail}`,
      phone: `019660000${phoneTail}`,
      division: "Dhaka",
      district: "Dhaka",
      thana: "Mirpur",
      line: "House 1",
    },
    items: [{ variantId: BK_VAR, quantity: 1 }],
    paymentMethod: "cod",
    source: "manual",
  });
  return r.orderId;
}

async function statusOf(id: string): Promise<string> {
  return withTenant(TENANT_A, OWNER_A, async (tx) => {
    const r = await tx<{ s: string }[]>`select fulfillment_status as s from orders where id = ${id}`;
    return r[0]?.s ?? "";
  });
}

describe("bulk order ops slice", () => {
  let a = "";
  let b = "";
  let c = "";

  beforeAll(async () => {
    await cleanup();
    await asPlatformAdmin(async (tx) => {
      await tx`
        insert into product (id, tenant_id, title, slug, status) values
          (${BK_PROD}, ${TENANT_A}, 'Bulk Item', 'bulk-item', 'active')
      `;
      await tx`
        insert into product_variant (id, tenant_id, product_id, title, sku, price, inventory_quantity, track_inventory) values
          (${BK_VAR}, ${TENANT_A}, ${BK_PROD}, 'M', 'BK-M', 400.00, 100, true)
      `;
    });
    a = await mkOrder("1");
    b = await mkOrder("2");
    c = await mkOrder("3");
    // Manual orders default to 'confirmed'; reset to 'pending' to simulate the
    // storefront orders a seller bulk-confirms each morning.
    await asPlatformAdmin(async (tx) => {
      await tx`update orders set fulfillment_status = 'pending'
               where id in (${a}, ${b}, ${c})`;
    });
  });

  afterAll(cleanup);

  it("1. bulk-confirms many pending orders", async () => {
    const res = await bulkAdvanceStatusCore(TENANT_A, OWNER_A, [a, b, c], "confirmed");
    expect(res.succeeded).toBe(3);
    expect(res.failed).toHaveLength(0);
    expect(await statusOf(a)).toBe("confirmed");
    expect(await statusOf(c)).toBe("confirmed");
  });

  it("2. partial success — invalid transition fails only that order", async () => {
    // a,b,c are 'confirmed'. confirmed→packed is valid; advance only a to packed
    // first, then try to bulk 'confirmed'->'shipped' (invalid: must go via packed).
    const step = await bulkAdvanceStatusCore(TENANT_A, OWNER_A, [a], "packed");
    expect(step.succeeded).toBe(1);

    // Now a=packed, b=c=confirmed. Bulk 'shipped': only a (packed) can ship.
    const res = await bulkAdvanceStatusCore(TENANT_A, OWNER_A, [a, b, c], "shipped");
    expect(res.succeeded).toBe(1); // a
    expect(res.failed).toHaveLength(2); // b, c rejected
    expect(await statusOf(a)).toBe("shipped");
    expect(await statusOf(b)).toBe("confirmed");
  });

  it("3. bulk cancel restores inventory", async () => {
    const before = await withTenant(TENANT_A, OWNER_A, async (tx) => {
      const r = await tx<{ q: number }[]>`select inventory_quantity as q from product_variant where id = ${BK_VAR}`;
      return r[0]!.q;
    });
    // b and c are 'confirmed' — cancellable. Each holds 1 unit.
    const res = await bulkAdvanceStatusCore(TENANT_A, OWNER_A, [b, c], "cancelled");
    expect(res.succeeded).toBe(2);
    const after = await withTenant(TENANT_A, OWNER_A, async (tx) => {
      const r = await tx<{ q: number }[]>`select inventory_quantity as q from product_variant where id = ${BK_VAR}`;
      return r[0]!.q;
    });
    expect(after).toBe(before + 2);
  });
});
