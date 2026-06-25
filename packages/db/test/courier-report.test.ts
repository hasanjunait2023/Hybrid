// ============================================================================
// Courier performance report (tenant roadmap P2-3). Embedded Postgres,
// app_runtime_login (RLS). Exercises getCourierPerformance over the shipment
// ledger: per-courier sent / delivered / returned, delivery + RTO rates, COD.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import { placeOrder } from "../../../apps/web/lib/commerce/placeOrder";
import { getCourierPerformance, type DateRange } from "../../../apps/web/lib/admin/reports";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const OWNER_A = "11111111-1111-1111-1111-111111111001";

const CP_PROD = "e0000014-0000-0000-0000-000000000e14";
const CP_VAR = "f0000014-0000-0000-0000-000000000f14";
const PHONE = "01988000014";
const RANGE: DateRange = { from: "2020-01-01", to: "2999-12-31" };

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from shipment where tenant_id = ${TENANT_A}`;
    await tx`delete from order_item where tenant_id = ${TENANT_A}`;
    await tx`delete from orders where tenant_id = ${TENANT_A}`;
    await tx`delete from customer where tenant_id = ${TENANT_A} and phone = ${PHONE}`;
    await tx`delete from product_variant where id = ${CP_VAR}`;
    await tx`delete from product where id = ${CP_PROD}`;
  });
}

describe("courier performance report (P2-3)", () => {
  beforeAll(async () => {
    await cleanup();
    await asPlatformAdmin(async (tx) => {
      await tx`
        insert into product (id, tenant_id, title, slug, status) values
          (${CP_PROD}, ${TENANT_A}, 'Courier Item', 'courier-item', 'active')
      `;
      await tx`
        insert into product_variant (id, tenant_id, product_id, title, sku, price, inventory_quantity, track_inventory) values
          (${CP_VAR}, ${TENANT_A}, ${CP_PROD}, 'M', 'CP-M', 500.00, 100, true)
      `;
    });
    const placed = await placeOrder({
      tenantId: TENANT_A,
      userId: OWNER_A,
      customer: { phone: PHONE, name: "Courier Tester" },
      shippingAddress: {
        recipient: "Courier Tester", phone: PHONE, division: "Dhaka",
        district: "Dhaka", thana: "Mirpur", line: "House 1",
      },
      items: [{ variantId: CP_VAR, quantity: 1 }],
      paymentMethod: "cod",
      source: "manual",
    });
    const orderId = placed.orderId;
    // Steadfast: 1 delivered (cod 500) + 1 returned. Pathao: 1 delivered.
    await asPlatformAdmin(async (tx) => {
      await tx`insert into shipment (tenant_id, order_id, provider, status, cod_collected, consignment_id)
               values (${TENANT_A}, ${orderId}, 'steadfast', 'delivered', 500, 'CP-SF-1')`;
      await tx`insert into shipment (tenant_id, order_id, provider, status, consignment_id)
               values (${TENANT_A}, ${orderId}, 'steadfast', 'returned', 'CP-SF-2')`;
      await tx`insert into shipment (tenant_id, order_id, provider, status, consignment_id)
               values (${TENANT_A}, ${orderId}, 'pathao', 'delivered', 'CP-PA-1')`;
    });
  });

  afterAll(cleanup);

  it("computes per-courier delivery + RTO rates", async () => {
    const rows = await getCourierPerformance(TENANT_A, OWNER_A, RANGE);
    const sf = rows.find((r) => r.provider === "steadfast");
    const pa = rows.find((r) => r.provider === "pathao");

    expect(sf).toBeDefined();
    expect(sf!.sent).toBe(2);
    expect(sf!.delivered).toBe(1);
    expect(sf!.returned).toBe(1);
    expect(sf!.deliveryRate).toBeCloseTo(0.5, 5);
    expect(sf!.rtoRate).toBeCloseTo(0.5, 5);
    expect(sf!.codCollected).toBe(500);

    expect(pa).toBeDefined();
    expect(pa!.sent).toBe(1);
    expect(pa!.deliveryRate).toBeCloseTo(1, 5);
    expect(pa!.rtoRate).toBeCloseTo(0, 5);
  });
});
