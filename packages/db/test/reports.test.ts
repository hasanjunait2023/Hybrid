// ============================================================================
// Reports & Finance slice (tenant roadmap P2-1). Embedded Postgres,
// app_runtime_login (RLS FORCED). Exercises apps/web/lib/admin/reports.ts.
//
// Proves: sales report sums revenue + orders over the range; top products rank
// by revenue; status report computes RTO rate; profit report computes gross
// margin from variant cost_price.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import { placeOrder } from "../../../apps/web/lib/commerce/placeOrder";
import {
  getSalesReport,
  getTopProducts,
  getStatusReport,
  getProfitReport,
  type DateRange,
} from "../../../apps/web/lib/admin/reports";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const OWNER_A = "11111111-1111-1111-1111-111111111001";

const RP_PROD = "e0000013-0000-0000-0000-000000000e13";
const RP_VAR = "f0000013-0000-0000-0000-000000000f13";

// Wide range so the seeded orders (placed "today") always fall inside.
const RANGE: DateRange = { from: "2020-01-01", to: "2999-12-31" };

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from order_item where tenant_id = ${TENANT_A}`;
    await tx`delete from orders where tenant_id = ${TENANT_A}`;
    await tx`delete from customer where tenant_id = ${TENANT_A} and phone like '019880000%'`;
    await tx`delete from product_variant where id = ${RP_VAR}`;
    await tx`delete from product where id = ${RP_PROD}`;
  });
}

async function mkOrder(tail: string, qty: number): Promise<string> {
  const r = await placeOrder({
    tenantId: TENANT_A,
    userId: OWNER_A,
    customer: { phone: `019880000${tail}`, name: `Rep ${tail}` },
    shippingAddress: {
      recipient: `Rep ${tail}`, phone: `019880000${tail}`, division: "Dhaka",
      district: "Dhaka", thana: "Mirpur", line: "House 1",
    },
    items: [{ variantId: RP_VAR, quantity: qty }],
    paymentMethod: "cod",
    source: "manual",
  });
  return r.orderId;
}

describe("reports & finance slice", () => {
  // price 1000, cost 600 → margin 40%.
  beforeAll(async () => {
    await cleanup();
    await asPlatformAdmin(async (tx) => {
      await tx`
        insert into product (id, tenant_id, title, slug, status) values
          (${RP_PROD}, ${TENANT_A}, 'Report Item', 'report-item', 'active')
      `;
      await tx`
        insert into product_variant (id, tenant_id, product_id, title, sku, price, cost_price, inventory_quantity, track_inventory) values
          (${RP_VAR}, ${TENANT_A}, ${RP_PROD}, 'M', 'RP-M', 1000.00, 600.00, 1000, true)
      `;
    });
    const o1 = await mkOrder("1", 2); // revenue 2000
    await mkOrder("2", 1); // revenue 1000
    const o3 = await mkOrder("3", 1); // will be cancelled (excluded)
    await asPlatformAdmin(async (tx) => {
      await tx`update orders set fulfillment_status = 'delivered' where id = ${o1}`;
      await tx`update orders set fulfillment_status = 'cancelled' where id = ${o3}`;
    });
  });

  afterAll(cleanup);

  it("1. sales report sums revenue + orders (excludes cancelled revenue)", async () => {
    const r = await getSalesReport(TENANT_A, OWNER_A, RANGE);
    // 3 orders placed; cancelled one contributes 0 revenue → 3000 from the two.
    expect(r.totalOrders).toBe(3);
    expect(r.totalRevenue).toBe(3000);
    expect(r.avgOrderValue).toBe(1000);
  });

  it("2. top products rank by revenue", async () => {
    const top = await getTopProducts(TENANT_A, OWNER_A, RANGE, 10);
    const row = top.find((p) => p.productId === RP_PROD);
    expect(row).toBeDefined();
    expect(row!.units).toBe(3); // 2 + 1 (cancelled excluded)
    expect(row!.revenue).toBe(3000);
  });

  it("3. status report computes RTO rate", async () => {
    const s = await getStatusReport(TENANT_A, OWNER_A, RANGE);
    expect(s.total).toBe(3);
    // 1 cancelled of 3 → rtoRate 1/3.
    expect(s.rtoRate).toBeCloseTo(1 / 3, 5);
  });

  it("4. profit report computes gross margin from cost_price", async () => {
    const p = await getProfitReport(TENANT_A, OWNER_A, RANGE);
    expect(p.hasCost).toBe(true);
    // revenue 3000, COGS 600*3 = 1800 → gross 1200, margin 40%.
    expect(p.revenue).toBe(3000);
    expect(p.cogs).toBe(1800);
    expect(p.grossProfit).toBe(1200);
    expect(p.margin).toBeCloseTo(0.4, 5);
  });
});
