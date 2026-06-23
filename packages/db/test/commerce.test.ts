// ============================================================================
// Commerce-core integration suite — the idempotent placeOrder transaction.
//
// Runs against the SAME ephemeral embedded Postgres as the RLS gate
// (global-setup.ts), as the non-superuser app_runtime_login role (RLS FORCED).
// It imports the shared commerce core straight from apps/web/lib/commerce/* —
// "@hybrid/db" is aliased to ../src/index.ts in vitest.config.ts so those
// modules resolve here.
//
// Proves (blueprint "Sacred invariants"):
//   1. COD order creates customer + order + items + payment atomically with the
//      trigger-assigned order_number.
//   2. Oversell: two concurrent placeOrder for the last unit → exactly ONE wins,
//      the other throws INSUFFICIENT_STOCK (atomic decrement, no negative stock).
//   3. Server-side pricing: a client-supplied price is ignored; DB price wins.
//   4. usage_counter increments per order for the month.
//   5. Cross-tenant safety: tenant A cannot order tenant B's variant (RLS).
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin, withTenant } from "../src/index";
import { placeOrder, InsufficientStockError } from "../../../apps/web/lib/commerce/placeOrder";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b";
const OWNER_A = "11111111-1111-1111-1111-111111111001";

// Dedicated test products/variants (kept separate from the RLS-suite seed rows
// so quantities are deterministic regardless of test order).
const PROD_A = "c0000001-0000-0000-0000-0000000000c1";
const VAR_TRACKED = "d0000001-0000-0000-0000-0000000000d1"; // tracked, qty seeded per test
const VAR_UNTRACKED = "d0000002-0000-0000-0000-0000000000d2"; // track_inventory = false
const VAR_LAST_UNIT = "d0000003-0000-0000-0000-0000000000d3"; // qty = 1 for oversell race

const PROD_B = "c0000002-0000-0000-0000-0000000000c2";
const VAR_B = "d0000004-0000-0000-0000-0000000000d4"; // belongs to tenant B

function addr(recipient = "Rahim Uddin") {
  return {
    recipient,
    phone: "01711000000",
    division: "Dhaka",
    district: "Dhaka",
    thana: "Mirpur",
    line: "House 1, Road 2",
  };
}

async function seedFixtures(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    // Clean any prior run's commerce rows for these tenants.
    await tx`delete from payment where tenant_id in (${TENANT_A}, ${TENANT_B})`;
    await tx`delete from order_item where tenant_id in (${TENANT_A}, ${TENANT_B})`;
    await tx`delete from orders where tenant_id in (${TENANT_A}, ${TENANT_B})`;
    await tx`delete from order_counter where tenant_id in (${TENANT_A}, ${TENANT_B})`;
    await tx`delete from customer_address where tenant_id in (${TENANT_A}, ${TENANT_B})`;
    await tx`delete from customer where tenant_id in (${TENANT_A}, ${TENANT_B})`;
    await tx`delete from usage_counter where tenant_id in (${TENANT_A}, ${TENANT_B})`;
    await tx`delete from product_variant where id in (${VAR_TRACKED}, ${VAR_UNTRACKED}, ${VAR_LAST_UNIT}, ${VAR_B})`;
    await tx`delete from product where id in (${PROD_A}, ${PROD_B})`;

    await tx`
      insert into product (id, tenant_id, title, slug, status)
      values
        (${PROD_A}, ${TENANT_A}, 'Commerce Test A', 'commerce-test-a', 'active'),
        (${PROD_B}, ${TENANT_B}, 'Commerce Test B', 'commerce-test-b', 'active')
    `;
    await tx`
      insert into product_variant
        (id, tenant_id, product_id, title, sku, price, inventory_quantity, track_inventory)
      values
        (${VAR_TRACKED},   ${TENANT_A}, ${PROD_A}, 'Tracked',   'SKU-T',  100.00, 5, true),
        (${VAR_UNTRACKED}, ${TENANT_A}, ${PROD_A}, 'Untracked', 'SKU-U',  250.00, 0, false),
        (${VAR_LAST_UNIT}, ${TENANT_A}, ${PROD_A}, 'LastUnit',  'SKU-L',  999.00, 1, true),
        (${VAR_B},         ${TENANT_B}, ${PROD_B}, 'B Variant', 'SKU-B',  500.00, 50, true)
    `;
  });
}

// Restore the seeded tenants to their original state so the RLS suite's
// product-count assertions hold regardless of test-file execution order
// (fileParallelism is off → both suites share one embedded DB serially).
async function cleanupFixtures(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from payment where tenant_id in (${TENANT_A}, ${TENANT_B})`;
    await tx`delete from order_item where tenant_id in (${TENANT_A}, ${TENANT_B})`;
    await tx`delete from orders where tenant_id in (${TENANT_A}, ${TENANT_B})`;
    await tx`delete from order_counter where tenant_id in (${TENANT_A}, ${TENANT_B})`;
    await tx`delete from customer_address where tenant_id in (${TENANT_A}, ${TENANT_B})`;
    await tx`delete from customer where tenant_id in (${TENANT_A}, ${TENANT_B})`;
    await tx`delete from usage_counter where tenant_id in (${TENANT_A}, ${TENANT_B})`;
    await tx`delete from product_variant where id in (${VAR_TRACKED}, ${VAR_UNTRACKED}, ${VAR_LAST_UNIT}, ${VAR_B})`;
    await tx`delete from product where id in (${PROD_A}, ${PROD_B})`;
  });
}

async function resetLastUnit(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`update product_variant set inventory_quantity = 1 where id = ${VAR_LAST_UNIT}`;
  });
}

describe("commerce core — placeOrder", () => {
  beforeAll(seedFixtures);
  afterAll(cleanupFixtures);

  it("1. COD order creates customer + order + items + payment atomically with order_number", async () => {
    const result = await placeOrder({
      tenantId: TENANT_A,
      userId: OWNER_A,
      customer: { phone: "01799900001", name: "Karim", email: "karim@example.com" },
      shippingAddress: addr(),
      items: [
        { variantId: VAR_TRACKED, quantity: 2 },
        { variantId: VAR_UNTRACKED, quantity: 1 },
      ],
      paymentMethod: "cod",
      source: "storefront",
    });

    expect(result.orderNumber).toBeGreaterThanOrEqual(1);
    expect(result.bkashRequired).toBe(false);
    expect(result.orderId).toBeTruthy();
    expect(result.paymentId).toBeTruthy();

    const snapshot = await withTenant(TENANT_A, OWNER_A, async (tx) => {
      const orders = await tx<
        {
          id: string;
          order_number: string;
          subtotal: string;
          grand_total: string;
          cod_amount: string;
          payment_status: string;
          fulfillment_status: string;
          customer_id: string;
        }[]
      >`select id, order_number, subtotal, grand_total, cod_amount, payment_status, fulfillment_status, customer_id
          from orders where id = ${result.orderId}`;
      const items = await tx<
        { unit_price: string; quantity: number; line_total: string }[]
      >`select unit_price, quantity, line_total from order_item where order_id = ${result.orderId} order by unit_price`;
      const payment = await tx<
        { provider: string; status: string; amount: string }[]
      >`select provider, status, amount from payment where id = ${result.paymentId}`;
      const customer = await tx<
        { orders_count: number; total_spent: string }[]
      >`select orders_count, total_spent from customer where id = ${orders[0]!.customer_id}`;
      const addrCount = await tx<
        { n: number }[]
      >`select count(*)::int as n from customer_address where customer_id = ${orders[0]!.customer_id} and is_default = true`;
      return { orders, items, payment, customer, addrCount };
    });

    const o = snapshot.orders[0]!;
    // subtotal = 2*100 + 1*250 = 450 (server-side prices).
    expect(Number(o.subtotal)).toBe(450);
    expect(Number(o.grand_total)).toBe(450);
    expect(Number(o.cod_amount)).toBe(450); // COD → cod_amount = grand_total
    expect(o.payment_status).toBe("unpaid"); // COD stays unpaid
    expect(o.fulfillment_status).toBe("confirmed"); // COD confirmed immediately
    expect(Number(o.order_number)).toBe(result.orderNumber);

    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.payment[0]!.provider).toBe("cod");
    expect(snapshot.payment[0]!.status).toBe("pending");
    expect(Number(snapshot.payment[0]!.amount)).toBe(450);

    expect(snapshot.customer[0]!.orders_count).toBe(1);
    expect(Number(snapshot.customer[0]!.total_spent)).toBe(450);
    expect(snapshot.addrCount[0]!.n).toBe(1);
  });

  it("2. oversell — two concurrent orders for the LAST unit: exactly one succeeds", async () => {
    await resetLastUnit();

    const place = () =>
      placeOrder({
        tenantId: TENANT_A,
        userId: OWNER_A,
        customer: { phone: "01799900002", name: "Concurrent Buyer" },
        shippingAddress: addr(),
        items: [{ variantId: VAR_LAST_UNIT, quantity: 1 }],
        paymentMethod: "cod",
        source: "storefront",
      });

    const results = await Promise.allSettled([place(), place()]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientStockError);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toBe(
      `INSUFFICIENT_STOCK:${VAR_LAST_UNIT}`,
    );

    // Stock landed at exactly 0 — never negative.
    const stock = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ inventory_quantity: number }[]>`
        select inventory_quantity from product_variant where id = ${VAR_LAST_UNIT}`,
    );
    expect(stock[0]!.inventory_quantity).toBe(0);
  });

  it("3. server-side pricing ignores any client-supplied price", async () => {
    const result = await placeOrder({
      tenantId: TENANT_A,
      userId: OWNER_A,
      customer: { phone: "01799900003", name: "Price Spoofer" },
      shippingAddress: addr(),
      // Client claims the 100.00 tracked variant costs 1 BDT — must be ignored.
      items: [{ variantId: VAR_TRACKED, quantity: 1, price: 1 }],
      paymentMethod: "cod",
      source: "storefront",
    });

    const row = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ unit_price: string; grand_total: string }[]>`
        select oi.unit_price, o.grand_total
          from order_item oi join orders o on o.id = oi.order_id
         where oi.order_id = ${result.orderId}`,
    );
    expect(Number(row[0]!.unit_price)).toBe(100); // DB price, not client's 1
    expect(Number(row[0]!.grand_total)).toBe(100);
  });

  it("4. usage_counter increments per order for the current month", async () => {
    const before = await usageCount(TENANT_A);
    await placeOrder({
      tenantId: TENANT_A,
      userId: OWNER_A,
      customer: { phone: "01799900004", name: "Usage Buyer" },
      shippingAddress: addr(),
      items: [{ variantId: VAR_UNTRACKED, quantity: 1 }],
      paymentMethod: "cod",
      source: "storefront",
    });
    const after = await usageCount(TENANT_A);
    expect(after).toBe(before + 1);
  });

  it("5. bKash order returns bkashRequired and leaves payment pending", async () => {
    const result = await placeOrder({
      tenantId: TENANT_A,
      userId: OWNER_A,
      customer: { phone: "01799900005", name: "Bkash Buyer" },
      shippingAddress: addr(),
      items: [{ variantId: VAR_UNTRACKED, quantity: 1 }],
      paymentMethod: "bkash",
      source: "storefront",
    });
    expect(result.bkashRequired).toBe(true);

    const row = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ provider: string; status: string; cod_amount: string }[]>`
        select p.provider, p.status, o.cod_amount
          from payment p join orders o on o.id = p.order_id
         where p.id = ${result.paymentId}`,
    );
    expect(row[0]!.provider).toBe("bkash");
    expect(row[0]!.status).toBe("pending");
    expect(Number(row[0]!.cod_amount)).toBe(0); // not COD → no cod_amount
  });

  it("6. cross-tenant safety — tenant A cannot order tenant B's variant (RLS)", async () => {
    await expect(
      placeOrder({
        tenantId: TENANT_A,
        userId: OWNER_A,
        customer: { phone: "01799900006", name: "Cross Tenant" },
        shippingAddress: addr(),
        items: [{ variantId: VAR_B, quantity: 1 }],
        paymentMethod: "cod",
        source: "storefront",
      }),
    ).rejects.toThrow(`INSUFFICIENT_STOCK:${VAR_B}`);

    // B's stock is untouched.
    const stock = await asPlatformAdmin((tx) =>
      tx<{ inventory_quantity: number }[]>`
        select inventory_quantity from product_variant where id = ${VAR_B}`,
    );
    expect(stock[0]!.inventory_quantity).toBe(50);
  });
});

async function usageCount(tenantId: string): Promise<number> {
  const rows = await withTenant(tenantId, OWNER_A, (tx) =>
    tx<{ orders_count: number }[]>`
      select orders_count from usage_counter
       where tenant_id = ${tenantId} and period_month = date_trunc('month', now())::date`,
  );
  return rows[0]?.orders_count ?? 0;
}
