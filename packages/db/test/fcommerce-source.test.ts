// ============================================================================
// F-commerce source tagging (tenant roadmap P3-3). Embedded Postgres, RLS.
// Orders carry an order_source ('messenger' included); listOrders filters by it
// so a seller can see/triage chat-channel orders separately.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import { placeOrder } from "../../../apps/web/lib/commerce/placeOrder";
import { listOrders } from "../../../apps/web/lib/admin/orders";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const OWNER_A = "11111111-1111-1111-1111-111111111001";

const FC_PROD = "e0000017-0000-0000-0000-000000000e17";
const FC_VAR = "f0000017-0000-0000-0000-000000000f17";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from order_item where tenant_id = ${TENANT_A}`;
    await tx`delete from orders where tenant_id = ${TENANT_A}`;
    await tx`delete from customer where tenant_id = ${TENANT_A} and phone like '019100000%'`;
    await tx`delete from product_variant where id = ${FC_VAR}`;
    await tx`delete from product where id = ${FC_PROD}`;
  });
}

async function mkOrder(tail: string, source: "manual" | "messenger"): Promise<string> {
  const r = await placeOrder({
    tenantId: TENANT_A,
    userId: OWNER_A,
    customer: { phone: `019100000${tail}`, name: `FC ${tail}` },
    shippingAddress: {
      recipient: `FC ${tail}`, phone: `019100000${tail}`, division: "Dhaka",
      district: "Dhaka", thana: "Mirpur", line: "House 1",
    },
    items: [{ variantId: FC_VAR, quantity: 1 }],
    paymentMethod: "cod",
    source,
  });
  return r.orderId;
}

describe("f-commerce source tagging (P3-3)", () => {
  let manualId = "";
  let messengerId = "";

  beforeAll(async () => {
    await cleanup();
    await asPlatformAdmin(async (tx) => {
      await tx`insert into product (id, tenant_id, title, slug, status) values
        (${FC_PROD}, ${TENANT_A}, 'FC Item', 'fc-item', 'active')`;
      await tx`insert into product_variant (id, tenant_id, product_id, title, sku, price, inventory_quantity, track_inventory) values
        (${FC_VAR}, ${TENANT_A}, ${FC_PROD}, 'M', 'FC-M', 500, 100, true)`;
    });
    manualId = await mkOrder("1", "manual");
    messengerId = await mkOrder("2", "messenger");
  });

  afterAll(cleanup);

  it("filters orders by channel source", async () => {
    const messenger = await listOrders(TENANT_A, OWNER_A, { source: "messenger" });
    const ids = messenger.map((o) => o.id);
    expect(ids).toContain(messengerId);
    expect(ids).not.toContain(manualId);

    const manual = await listOrders(TENANT_A, OWNER_A, { source: "manual" });
    expect(manual.map((o) => o.id)).toContain(manualId);
  });
});
