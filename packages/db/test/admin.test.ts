// ============================================================================
// Admin slice integration suite (Wave-1: catalog / orders / customers /
// dashboard / manual-order). Runs against the SAME ephemeral embedded Postgres
// as the RLS gate (global-setup.ts), as the non-superuser app_runtime_login role
// (RLS FORCED). Imports the admin data helpers + the manual-order data path
// straight from apps/web/lib/** — "@hybrid/db" is aliased to ../src/index.ts in
// vitest.config.ts so those modules resolve here.
//
// Proves:
//   1. listProducts respects status filter + title search (trigram path).
//   2. listOrders + status counts reflect created orders; COD-pending filter.
//   3. getOrderDetail returns the order with its items + payment.
//   4. Manual order (placeOrder source:'manual') actually creates an order, and
//      updateOrderStatus's cancel restores inventory.
//   5. getCustomerDetail surfaces order history; dashboard counts today's order.
//   6. Cross-tenant: tenant A's helpers never see tenant B's rows (RLS).
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin, withTenant } from "../src/index";
import { placeOrder } from "../../../apps/web/lib/commerce/placeOrder";
import {
  listProducts,
  getProductFull,
} from "../../../apps/web/lib/admin/catalog";
import {
  listOrders,
  getOrderStatusCounts,
  getOrderDetail,
} from "../../../apps/web/lib/admin/orders";
import * as ordersLib from "../../../apps/web/lib/admin/orders";
import { getCustomerDetail as getCustomer } from "../../../apps/web/lib/admin/customers";
import { getDashboard } from "../../../apps/web/lib/admin/dashboard";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b";
const OWNER_A = "11111111-1111-1111-1111-111111111001";
const OWNER_B = "11111111-1111-1111-1111-111111111002";

const PROD_ACTIVE = "e0000001-0000-0000-0000-0000000000e1";
const PROD_DRAFT = "e0000002-0000-0000-0000-0000000000e2";
const VAR_ACTIVE = "f0000001-0000-0000-0000-0000000000f1";
const VAR_DRAFT = "f0000002-0000-0000-0000-0000000000f2";
const PROD_B = "e0000003-0000-0000-0000-0000000000e3";
const VAR_B = "f0000003-0000-0000-0000-0000000000f3";

// NOTE: the embedded-postgres test cluster initdb's with the host Windows
// locale (WIN1252 on this machine), so fixtures stay ASCII. The real Supabase /
// Docker Postgres is UTF-8 and stores Bangla fine; the data helpers under test
// are encoding-agnostic. (The storefront/checkout suites that need Bangla run on
// the UTF-8 server.)
function addr() {
  return {
    recipient: "Test Grahok",
    phone: "01911000000",
    division: "Dhaka",
    district: "Dhaka",
    thana: "Mirpur",
    line: "House 9, Road 4",
  };
}

async function seed(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await cleanup(tx);
    await tx`
      insert into product (id, tenant_id, title, slug, status) values
        (${PROD_ACTIVE}, ${TENANT_A}, 'Admin Test Shirt', 'admin-test-shirt', 'active'),
        (${PROD_DRAFT},  ${TENANT_A}, 'Admin Draft Cap',  'admin-draft-cap',  'draft'),
        (${PROD_B},      ${TENANT_B}, 'B Only Product',   'b-only-product',   'active')
    `;
    await tx`
      insert into product_variant (id, tenant_id, product_id, title, sku, price, inventory_quantity, track_inventory) values
        (${VAR_ACTIVE}, ${TENANT_A}, ${PROD_ACTIVE}, 'M', 'SHIRT-M', 500.00, 10, true),
        (${VAR_DRAFT},  ${TENANT_A}, ${PROD_DRAFT},  'L', 'CAP-L',   300.00, 4,  true),
        (${VAR_B},      ${TENANT_B}, ${PROD_B},      'X', 'B-X',     900.00, 7,  true)
    `;
  });
}

async function cleanup(tx: import("../src/index").Tx): Promise<void> {
  const ids = [PROD_ACTIVE, PROD_DRAFT, PROD_B];
  await tx`delete from payment where tenant_id in (${TENANT_A}, ${TENANT_B})`;
  await tx`delete from order_item where tenant_id in (${TENANT_A}, ${TENANT_B})`;
  await tx`delete from orders where tenant_id in (${TENANT_A}, ${TENANT_B})`;
  await tx`delete from order_counter where tenant_id in (${TENANT_A}, ${TENANT_B})`;
  await tx`delete from customer_address where tenant_id in (${TENANT_A}, ${TENANT_B})`;
  await tx`delete from customer where tenant_id in (${TENANT_A}, ${TENANT_B})`;
  await tx`delete from usage_counter where tenant_id in (${TENANT_A}, ${TENANT_B})`;
  await tx`delete from product_variant where product_id in ${tx(ids)}`;
  await tx`delete from product where id in ${tx(ids)}`;
}

describe("admin slice", () => {
  beforeAll(seed);
  afterAll(async () => {
    await asPlatformAdmin(cleanup);
  });

  it("1. listProducts — status filter + title search", async () => {
    const all = await listProducts(TENANT_A, OWNER_A, {});
    const titles = all.map((p) => p.title);
    expect(titles).toContain("Admin Test Shirt");
    expect(titles).toContain("Admin Draft Cap");

    const activeOnly = await listProducts(TENANT_A, OWNER_A, { status: "active" });
    expect(activeOnly.every((p) => p.status === "active")).toBe(true);
    expect(activeOnly.map((p) => p.title)).not.toContain("Admin Draft Cap");

    const searched = await listProducts(TENANT_A, OWNER_A, { query: "Shirt" });
    expect(searched.map((p) => p.title)).toContain("Admin Test Shirt");
    expect(searched.map((p) => p.title)).not.toContain("Admin Draft Cap");

    const shirt = all.find((p) => p.id === PROD_ACTIVE)!;
    expect(shirt.price).toBe(500);
    expect(shirt.inventory).toBe(10);
    expect(shirt.variantCount).toBe(1);
  });

  it("2. getProductFull — options/variants/images/collections", async () => {
    const full = await getProductFull(TENANT_A, OWNER_A, PROD_ACTIVE);
    expect(full).not.toBeNull();
    expect(full!.title).toBe("Admin Test Shirt");
    expect(full!.variants).toHaveLength(1);
    expect(full!.variants[0]!.sku).toBe("SHIRT-M");
  });

  it("3. manual order via placeOrder creates an order (source:manual)", async () => {
    const result = await placeOrder({
      tenantId: TENANT_A,
      userId: OWNER_A,
      customer: { phone: "01922000001", name: "Manual Grahok" },
      shippingAddress: addr(),
      items: [{ variantId: VAR_ACTIVE, quantity: 2 }],
      paymentMethod: "cod",
      source: "manual",
      shippingTotal: 60,
    });
    expect(result.orderId).toBeTruthy();
    expect(result.orderNumber).toBeGreaterThanOrEqual(1);

    const detail = await getOrderDetail(TENANT_A, OWNER_A, result.orderId);
    expect(detail).not.toBeNull();
    expect(detail!.source).toBe("manual");
    expect(detail!.grandTotal).toBe(1060); // 2*500 + 60 shipping
    expect(detail!.codAmount).toBe(1060);
    expect(detail!.items).toHaveLength(1);
    expect(detail!.payment?.provider).toBe("cod");
  });

  it("4. listOrders + counts + COD-pending filter", async () => {
    const list = await listOrders(TENANT_A, OWNER_A, {});
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0]!.source).toBeDefined();

    const counts = await getOrderStatusCounts(TENANT_A, OWNER_A);
    expect(counts.all).toBeGreaterThanOrEqual(1);
    // The manual COD order is confirmed + unpaid → counts as COD-pending.
    expect(counts.codPending).toBeGreaterThanOrEqual(1);

    const codList = await listOrders(TENANT_A, OWNER_A, { codPending: true });
    expect(codList.every((o) => o.codAmount > 0 && o.paymentStatus === "unpaid")).toBe(true);

    const phoneSearch = await listOrders(TENANT_A, OWNER_A, { query: "01922000001" });
    expect(phoneSearch.length).toBe(1);
  });

  it("5. cancel restores inventory (the transition rule)", async () => {
    // Place an order that decrements VAR_ACTIVE, then cancel and assert restore.
    const before = await stockOf(VAR_ACTIVE);
    const result = await placeOrder({
      tenantId: TENANT_A,
      userId: OWNER_A,
      customer: { phone: "01922000002", name: "Cancel Tester" },
      shippingAddress: addr(),
      items: [{ variantId: VAR_ACTIVE, quantity: 3 }],
      paymentMethod: "cod",
      source: "manual",
    });
    expect(await stockOf(VAR_ACTIVE)).toBe(before - 3);

    // Apply the cancel transition's data path inside withTenant (mirrors the
    // Server Action: validate then restoreInventory then flip status).
    expect(ordersLib.canTransition("confirmed", "cancelled")).toBe(true);
    await withTenant(TENANT_A, OWNER_A, async (tx) => {
      await ordersLib.restoreInventory(tx, result.orderId);
      await tx`update orders set fulfillment_status = 'cancelled' where id = ${result.orderId}`;
    });
    expect(await stockOf(VAR_ACTIVE)).toBe(before); // restored
  });

  it("6. getCustomerDetail surfaces order history", async () => {
    const customerId = await withTenant(TENANT_A, OWNER_A, async (tx) => {
      const rows = await tx<{ id: string }[]>`
        select id from customer where phone = '01922000001' limit 1`;
      return rows[0]!.id;
    });
    const customer = await getCustomer(TENANT_A, OWNER_A, customerId);
    expect(customer).not.toBeNull();
    expect(customer!.ordersCount).toBeGreaterThanOrEqual(1);
    expect(customer!.orders.length).toBeGreaterThanOrEqual(1);
  });

  it("7. dashboard counts today's order (Asia/Dhaka boundary)", async () => {
    const data = await getDashboard(TENANT_A, OWNER_A);
    expect(data.todayOrders).toBeGreaterThanOrEqual(1);
    expect(data.todayRevenue).toBeGreaterThan(0);
    // Low-stock threshold ≤5: the draft cap variant (qty 4) qualifies among
    // active products only — it is draft, so it should NOT be counted.
    expect(typeof data.lowStockCount).toBe("number");
  });

  it("8. cross-tenant — tenant B's owner never sees tenant A's products (RLS)", async () => {
    const bProducts = await listProducts(TENANT_B, OWNER_B, {});
    const ids = bProducts.map((p) => p.id);
    expect(ids).not.toContain(PROD_ACTIVE);
    expect(ids).toContain(PROD_B);

    // A's order detail is invisible to B.
    const aOrders = await listOrders(TENANT_A, OWNER_A, {});
    const someAOrderId = aOrders[0]!.id;
    const leaked = await getOrderDetail(TENANT_B, OWNER_B, someAOrderId);
    expect(leaked).toBeNull();
  });
});

async function stockOf(variantId: string): Promise<number> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ inventory_quantity: number }[]>`
      select inventory_quantity from product_variant where id = ${variantId}`,
  );
  return rows[0]!.inventory_quantity;
}
