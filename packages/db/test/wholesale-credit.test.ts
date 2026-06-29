// ============================================================================
// Wholesale B2B credit-sale suite. Exercises the credit branch of the real
// placeOrder() core (apps/web/lib/commerce/placeOrder.ts) against the embedded
// Postgres: a pay-later wholesale order must tag order_mode='wholesale', record
// credit_due (not cod_amount), post a customer_ledger 'sale' row, raise
// customer.current_due, and be rejected once the credit limit is exceeded.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import { placeOrder, CreditLimitExceededError } from "@/lib/commerce/placeOrder";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const PROD_A = "a0000001-0000-0000-0000-0000000000a1";
const PHONE_OK = "+8801799000777"; // generous credit line — happy path
const PHONE_CAP = "+8801799000888"; // tight credit line — limit breach

let variantId = "";
let unitPrice = 0;

const shipTo = {
  recipient: "Paikari Buyer",
  phone: PHONE_OK,
  division: "Dhaka",
  district: "Dhaka",
  thana: "Gulshan",
  line: "Wholesale Road 1",
};

async function cleanupPhone(phone: string): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    const custs = await tx<{ id: string }[]>`
      select id from customer where tenant_id = ${TENANT_A} and phone = ${phone}
    `;
    for (const c of custs) {
      const orders = await tx<{ id: string }[]>`
        select id from orders where tenant_id = ${TENANT_A} and customer_id = ${c.id}
      `;
      const orderIds = orders.map((o) => o.id);
      if (orderIds.length > 0) {
        await tx`delete from payment where order_id in ${tx(orderIds)}`;
        await tx`delete from order_item where order_id in ${tx(orderIds)}`;
        await tx`delete from orders where id in ${tx(orderIds)}`;
      }
      await tx`delete from customer_ledger where customer_id = ${c.id}`;
      await tx`delete from customer_address where customer_id = ${c.id}`;
      await tx`delete from customer where id = ${c.id}`;
    }
  });
}

async function seedCustomer(phone: string, creditLimit: number): Promise<void> {
  await asPlatformAdmin(
    (tx) => tx`
      insert into customer (tenant_id, phone, name, customer_type, credit_limit, current_due, is_verified)
      values (${TENANT_A}, ${phone}, 'Paikari Buyer', 'retailer', ${creditLimit}, 0, true)
    `,
  );
}

describe("Wholesale credit sale", () => {
  beforeAll(async () => {
    await cleanupPhone(PHONE_OK);
    await cleanupPhone(PHONE_CAP);

    // Resolve a variant and make sure it has plenty of stock for repeated runs.
    const rows = await asPlatformAdmin((tx) =>
      tx<{ id: string; price: string }[]>`
        select id, price from product_variant
         where product_id = ${PROD_A} order by position asc limit 1
      `,
    );
    variantId = rows[0]!.id;
    unitPrice = Number(rows[0]!.price);
    await asPlatformAdmin(
      (tx) => tx`
        update product_variant set inventory_quantity = 100000
         where id = ${variantId}
      `,
    );
  });

  afterAll(async () => {
    await cleanupPhone(PHONE_OK);
    await cleanupPhone(PHONE_CAP);
  });

  it("1. a credit order tags order_mode, records credit_due (not COD), and posts a ledger 'sale'", async () => {
    await seedCustomer(PHONE_OK, 1_000_000);

    const placed = await placeOrder({
      tenantId: TENANT_A,
      userId: null,
      customer: { phone: PHONE_OK, name: "Paikari Buyer" },
      shippingAddress: { ...shipTo, phone: PHONE_OK },
      items: [{ variantId, quantity: 3 }],
      paymentMethod: "cod", // deferred-collection placeholder
      source: "storefront",
      orderMode: "wholesale",
      creditSale: true,
    });

    const expectedTotal = unitPrice * 3;

    const order = await asPlatformAdmin((tx) =>
      tx<
        {
          order_mode: string;
          credit_due: string;
          credit_approved: boolean;
          cod_amount: string;
          grand_total: string;
        }[]
      >`
        select order_mode, credit_due, credit_approved, cod_amount, grand_total
          from orders where id = ${placed.orderId}
      `,
    );
    expect(order[0]?.order_mode).toBe("wholesale");
    expect(Number(order[0]?.grand_total)).toBeCloseTo(expectedTotal, 2);
    expect(Number(order[0]?.credit_due)).toBeCloseTo(expectedTotal, 2);
    expect(order[0]?.credit_approved).toBe(true);
    // Credit sale → collected via ledger, NOT on delivery.
    expect(Number(order[0]?.cod_amount)).toBe(0);

    // Ledger 'sale' row with running balance = the order total.
    const ledger = await asPlatformAdmin((tx) =>
      tx<{ type: string; amount: string; balance: string; reference_id: string }[]>`
        select cl.type, cl.amount, cl.balance, cl.reference_id
          from customer_ledger cl
          join customer c on c.id = cl.customer_id
         where c.tenant_id = ${TENANT_A} and c.phone = ${PHONE_OK}
         order by cl.created_at desc
      `,
    );
    expect(ledger.length).toBe(1);
    expect(ledger[0]?.type).toBe("sale");
    expect(Number(ledger[0]?.amount)).toBeCloseTo(expectedTotal, 2);
    expect(Number(ledger[0]?.balance)).toBeCloseTo(expectedTotal, 2);
    expect(ledger[0]?.reference_id).toBe(placed.orderId);

    // customer.current_due tracks the running balance.
    const cust = await asPlatformAdmin((tx) =>
      tx<{ current_due: string }[]>`
        select current_due from customer where tenant_id = ${TENANT_A} and phone = ${PHONE_OK}
      `,
    );
    expect(Number(cust[0]?.current_due)).toBeCloseTo(expectedTotal, 2);
  });

  it("2. a second credit order accumulates the running balance", async () => {
    const placed = await placeOrder({
      tenantId: TENANT_A,
      userId: null,
      customer: { phone: PHONE_OK, name: "Paikari Buyer" },
      shippingAddress: { ...shipTo, phone: PHONE_OK },
      items: [{ variantId, quantity: 2 }],
      paymentMethod: "cod",
      source: "storefront",
      orderMode: "wholesale",
      creditSale: true,
    });

    const expectedRunning = unitPrice * 3 + unitPrice * 2;

    const ledger = await asPlatformAdmin((tx) =>
      tx<{ balance: string; reference_id: string }[]>`
        select cl.balance, cl.reference_id
          from customer_ledger cl
          join customer c on c.id = cl.customer_id
         where c.tenant_id = ${TENANT_A} and c.phone = ${PHONE_OK}
         order by cl.created_at desc
         limit 1
      `,
    );
    expect(ledger[0]?.reference_id).toBe(placed.orderId);
    expect(Number(ledger[0]?.balance)).toBeCloseTo(expectedRunning, 2);

    const cust = await asPlatformAdmin((tx) =>
      tx<{ current_due: string }[]>`
        select current_due from customer where tenant_id = ${TENANT_A} and phone = ${PHONE_OK}
      `,
    );
    expect(Number(cust[0]?.current_due)).toBeCloseTo(expectedRunning, 2);
  });

  it("3. a credit order over the limit is rejected and writes nothing", async () => {
    // Limit barely below a single unit → the first credit order must breach it.
    await seedCustomer(PHONE_CAP, Math.max(1, Math.floor(unitPrice / 2)));

    await expect(
      placeOrder({
        tenantId: TENANT_A,
        userId: null,
        customer: { phone: PHONE_CAP, name: "Paikari Buyer" },
        shippingAddress: { ...shipTo, phone: PHONE_CAP },
        items: [{ variantId, quantity: 1 }],
        paymentMethod: "cod",
        source: "storefront",
        orderMode: "wholesale",
        creditSale: true,
      }),
    ).rejects.toBeInstanceOf(CreditLimitExceededError);

    // Whole txn rolled back: no order, no ledger row, due untouched.
    const orders = await asPlatformAdmin((tx) =>
      tx<{ n: string }[]>`
        select count(*)::bigint as n from orders o
          join customer c on c.id = o.customer_id
         where c.tenant_id = ${TENANT_A} and c.phone = ${PHONE_CAP}
      `,
    );
    expect(Number(orders[0]?.n)).toBe(0);

    const cust = await asPlatformAdmin((tx) =>
      tx<{ current_due: string }[]>`
        select current_due from customer where tenant_id = ${TENANT_A} and phone = ${PHONE_CAP}
      `,
    );
    expect(Number(cust[0]?.current_due)).toBe(0);
  });

  it("4. a wholesale COD order does NOT consume credit or post a ledger row", async () => {
    const placed = await placeOrder({
      tenantId: TENANT_A,
      userId: null,
      customer: { phone: PHONE_CAP, name: "Paikari Buyer" },
      shippingAddress: { ...shipTo, phone: PHONE_CAP },
      items: [{ variantId, quantity: 1 }],
      paymentMethod: "cod",
      source: "storefront",
      orderMode: "wholesale",
      creditSale: false,
    });

    const order = await asPlatformAdmin((tx) =>
      tx<{ order_mode: string; cod_amount: string; credit_due: string }[]>`
        select order_mode, cod_amount, credit_due from orders where id = ${placed.orderId}
      `,
    );
    // Still tagged wholesale, but collected on delivery — no credit due.
    expect(order[0]?.order_mode).toBe("wholesale");
    expect(Number(order[0]?.cod_amount)).toBeCloseTo(unitPrice, 2);
    expect(Number(order[0]?.credit_due)).toBe(0);

    const ledger = await asPlatformAdmin((tx) =>
      tx<{ n: string }[]>`
        select count(*)::bigint as n from customer_ledger cl
          join customer c on c.id = cl.customer_id
         where c.tenant_id = ${TENANT_A} and c.phone = ${PHONE_CAP}
      `,
    );
    expect(Number(ledger[0]?.n)).toBe(0);
  });
});
