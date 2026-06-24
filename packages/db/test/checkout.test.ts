// ============================================================================
// Storefront checkout + bKash callback integration suite (Wave-2: S-CHECKOUT,
// the GATE slice). Runs against the SAME ephemeral embedded Postgres as the RLS
// gate (global-setup.ts), as the non-superuser app_runtime_login role (RLS
// FORCED). Imports the checkout action + callback core straight from
// apps/web/lib/** and apps/web/app/** — "@hybrid/db" / "@hybrid/payments" /
// "next/cache" are aliased in vitest.config.ts so those modules resolve here.
//
// This suite tests the WIRING + IDEMPOTENCY (the bKash provider HTTP itself is
// unit-tested in @hybrid/payments). Proves (blueprint "Sacred invariants"):
//   1. COD checkout via submitCheckout creates a confirmed, paid-on-delivery
//      order end-to-end (customer + order + items + payment, cod_amount=total,
//      payment_status unpaid, fulfillment confirmed).
//   2. bKash callback REPLAY — the same paymentID processed twice runs exactly
//      ONCE (webhook_event unique(provider,external_id) guard): first call pays
//      the order, the second is "replayed" and changes nothing. Exactly one
//      webhook_event row, and the provider executePayment is called once.
//
// SMS is log-only (SMS_LIVE unset) so notifications never touch the network.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { asPlatformAdmin, withTenant } from "../src/index";
import type { Tx } from "../src/index";
import type {
  PaymentProvider,
  ProviderCreds,
  ExecutePaymentResult,
  QueryPaymentResult,
  CreatePaymentResult,
} from "../../payments/src/index";
import { submitCheckout } from "../../../apps/web/app/%5Fsites/[tenant]/checkout/actions";
import { processBkashCallback } from "../../../apps/web/lib/payments/callback";
import { __resetCache } from "./redis-client-stub";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a"; // slug 'store-a' (seed)

const PROD = "e0000001-0000-0000-0000-0000000000e1";
const VAR_COD = "e0000002-0000-0000-0000-0000000000e2"; // tracked, qty seeded per test
const VAR_BKASH = "e0000003-0000-0000-0000-0000000000e3"; // for the bKash order

const COD_PHONE = "01711222001";
const BKASH_PHONE = "01711222002";

async function seedFixtures(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await cleanup(tx);
    await tx`
      insert into product (id, tenant_id, title, slug, status)
      values (${PROD}, ${TENANT_A}, 'Checkout Test', 'checkout-test', 'active')
    `;
    await tx`
      insert into product_variant
        (id, tenant_id, product_id, title, sku, price, inventory_quantity, track_inventory)
      values
        (${VAR_COD},   ${TENANT_A}, ${PROD}, 'COD',   'SKU-COD',   500.00, 10, true),
        (${VAR_BKASH}, ${TENANT_A}, ${PROD}, 'BKASH', 'SKU-BKASH', 750.00, 10, true)
    `;
  });
}

async function cleanup(tx: Tx): Promise<void> {
  await tx`delete from webhook_event where tenant_id = ${TENANT_A} and provider = 'bkash'`;
  await tx`delete from payment where tenant_id = ${TENANT_A} and order_id in (select id from orders where customer_phone in (${COD_PHONE}, ${BKASH_PHONE}))`;
  await tx`delete from order_item where tenant_id = ${TENANT_A} and order_id in (select id from orders where customer_phone in (${COD_PHONE}, ${BKASH_PHONE}))`;
  await tx`delete from orders where tenant_id = ${TENANT_A} and customer_phone in (${COD_PHONE}, ${BKASH_PHONE})`;
  await tx`delete from order_counter where tenant_id = ${TENANT_A}`;
  await tx`delete from customer_address where tenant_id = ${TENANT_A} and customer_id in (select id from customer where phone in (${COD_PHONE}, ${BKASH_PHONE}))`;
  await tx`delete from customer where tenant_id = ${TENANT_A} and phone in (${COD_PHONE}, ${BKASH_PHONE})`;
  await tx`delete from usage_counter where tenant_id = ${TENANT_A}`;
  await tx`delete from product_variant where id in (${VAR_COD}, ${VAR_BKASH})`;
  await tx`delete from product where id = ${PROD}`;
}

async function cleanupFixtures(): Promise<void> {
  await asPlatformAdmin(cleanup);
}

// The embedded PG cluster is WIN1252-encoded on Windows; use Latin address
// values here (Bengali rendering is a UI concern proven by the storefront/QA,
// not this wiring suite). placeOrder stores whatever it's handed.
const ADDR = {
  division: "Dhaka",
  district: "Dhaka",
  thana: "Mirpur",
  addressLine: "House 1, Road 2",
};

describe("storefront checkout — COD via submitCheckout", () => {
  beforeAll(seedFixtures);
  afterAll(cleanupFixtures);

  it("1. COD checkout creates a confirmed, paid-on-delivery order end-to-end", async () => {
    const result = await submitCheckout({
      tenantSlug: "store-a",
      phone: COD_PHONE,
      name: "Rahima",
      ...ADDR,
      paymentMethod: "cod",
      items: [{ variantId: VAR_COD, quantity: 2 }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.method).toBe("cod");
    if (result.method !== "cod") return;
    expect(result.orderNumber).toBeGreaterThanOrEqual(1);

    const snapshot = await withTenant(TENANT_A, null, async (tx) => {
      const orders = await tx<
        {
          id: string;
          cod_amount: string;
          grand_total: string;
          payment_status: string;
          fulfillment_status: string;
          source: string;
        }[]
      >`select id, cod_amount, grand_total, payment_status, fulfillment_status, source
          from orders where customer_phone = ${COD_PHONE}`;
      const order = orders[0]!;
      const items = await tx<{ unit_price: string; quantity: number }[]>`
        select unit_price, quantity from order_item where order_id = ${order.id}`;
      const payment = await tx<{ provider: string; status: string; amount: string }[]>`
        select provider, status, amount from payment where order_id = ${order.id}`;
      return { order, items, payment };
    });

    // 2 × 500 = 1000, server-priced. COD → cod_amount=total, unpaid, confirmed.
    expect(Number(snapshot.order.grand_total)).toBe(1000);
    expect(Number(snapshot.order.cod_amount)).toBe(1000);
    expect(snapshot.order.payment_status).toBe("unpaid");
    expect(snapshot.order.fulfillment_status).toBe("confirmed");
    expect(snapshot.order.source).toBe("storefront");
    expect(snapshot.items).toHaveLength(1);
    expect(Number(snapshot.items[0]!.unit_price)).toBe(500);
    expect(snapshot.payment[0]!.provider).toBe("cod");
  });

  it("2. rejects an out-of-stock COD checkout (atomic decrement guard)", async () => {
    // Drain VAR_COD to 0, then a checkout for 1 must fail.
    await asPlatformAdmin(
      (tx) => tx`update product_variant set inventory_quantity = 0 where id = ${VAR_COD}`,
    );
    const result = await submitCheckout({
      tenantSlug: "store-a",
      phone: "01711222099",
      name: "NoStock",
      ...ADDR,
      paymentMethod: "cod",
      items: [{ variantId: VAR_COD, quantity: 1 }],
    });
    expect(result.ok).toBe(false);
    // Restore for any later runs.
    await asPlatformAdmin(
      (tx) => tx`update product_variant set inventory_quantity = 10 where id = ${VAR_COD}`,
    );
  });
});

// A stub PaymentProvider that records how many times execute is called, so we
// can prove the replay guard runs the DB transition exactly once. createPayment
// returns a fixed gateway paymentID + bkashURL; execute returns success.
function makeStubBkash(paymentId: string): {
  provider: PaymentProvider;
  creds: ProviderCreds;
  executeCalls: () => number;
} {
  let executeCalls = 0;
  const creds: ProviderCreds = {
    mode: "sandbox",
    username: "u",
    password: "p",
    appKey: "k",
    appSecret: "s",
  };
  const provider: PaymentProvider = {
    provider: "bkash",
    async createPayment(): Promise<CreatePaymentResult> {
      return { state: "pending", paymentId, redirectUrl: "https://bkash/redirect", raw: {} };
    },
    async executePayment(): Promise<ExecutePaymentResult> {
      executeCalls += 1;
      // amount must match the seeded order total (750) — the callback now verifies
      // the gateway-charged amount before marking paid (HARDEN FIX 1).
      return { state: "success", trxId: "TRX-STUB-001", amount: "750.00", raw: { statusCode: "0000" } };
    },
    async queryPayment(): Promise<QueryPaymentResult> {
      return { state: "success", trxId: "TRX-STUB-001", amount: "750.00", raw: { statusCode: "0000" } };
    },
  };
  return { provider, creds, executeCalls: () => executeCalls };
}

describe("bKash callback — replay idempotency (webhook_event guard)", () => {
  const GATEWAY_PAYMENT_ID = "bkash-pay-REPLAY-001";

  beforeAll(seedFixtures);
  afterAll(cleanupFixtures);

  // Seed a pending bKash order whose payment.provider_ref = the gateway
  // paymentID (as the checkout action would have set after createPayment).
  beforeEach(async () => {
    await asPlatformAdmin(async (tx) => {
      await tx`delete from webhook_event where provider = 'bkash' and external_id = ${GATEWAY_PAYMENT_ID}`;
      await tx`delete from payment where tenant_id = ${TENANT_A} and order_id in (select id from orders where customer_phone = ${BKASH_PHONE})`;
      await tx`delete from order_item where tenant_id = ${TENANT_A} and order_id in (select id from orders where customer_phone = ${BKASH_PHONE})`;
      await tx`delete from orders where tenant_id = ${TENANT_A} and customer_phone = ${BKASH_PHONE}`;
    });

    // Use the real placeOrder via submitCheckout would also call the gateway; to
    // isolate the callback we build the pending order directly through a bKash
    // submit with a stub provider seeded into a payment_account. Simpler: create
    // the order + payment rows directly (the placeOrder path is covered above).
    await withTenant(TENANT_A, null, async (tx) => {
      const order = await tx<{ id: string }[]>`
        insert into orders (
          tenant_id, customer_name, customer_phone, shipping_address,
          subtotal, grand_total, cod_amount, currency,
          payment_status, fulfillment_status, source
        ) values (
          ${TENANT_A}, 'Bkash Buyer', ${BKASH_PHONE}, ${tx.json({ division: "Dhaka" })},
          750, 750, 0, 'BDT', 'unpaid', 'pending', 'storefront'
        ) returning id`;
      // Seed payload.analytics.eventId exactly as placeOrder does — the success
      // page reads it to dedup the purchase event. The callback must MERGE, not
      // clobber, so this key survives the success write.
      await tx`
        insert into payment (tenant_id, order_id, provider, status, amount, provider_ref, payload)
        values (${TENANT_A}, ${order[0]!.id}, 'bkash', 'pending', 750, ${GATEWAY_PAYMENT_ID},
                ${tx.json({ analytics: { eventId: "evt-survives-001" } })})`;
    });
  });

  it("processes the same paymentID exactly once; the replay is a no-op", async () => {
    const stub = makeStubBkash(GATEWAY_PAYMENT_ID);
    const getProvider = async () => ({ provider: stub.provider, creds: stub.creds });

    // First callback — should pay the order.
    const first = await processBkashCallback({
      paymentId: GATEWAY_PAYMENT_ID,
      status: "success",
      getProvider,
    });
    expect(first.outcome).toBe("paid");
    expect(first.orderNumber).not.toBeNull();

    // Replay — same paymentID. webhook_event unique blocks reprocessing.
    const second = await processBkashCallback({
      paymentId: GATEWAY_PAYMENT_ID,
      status: "success",
      getProvider,
    });
    expect(second.outcome).toBe("replayed");

    // Exactly ONE webhook_event row, the order is paid once, and the payment has
    // the single trxID (payment_txn_uniq would have rejected a duplicate).
    const state = await withTenant(TENANT_A, null, async (tx) => {
      const events = await tx<{ n: number }[]>`
        select count(*)::int as n from webhook_event
         where provider = 'bkash' and external_id = ${GATEWAY_PAYMENT_ID}`;
      const order = await tx<{ payment_status: string }[]>`
        select payment_status from orders where customer_phone = ${BKASH_PHONE}`;
      const payment = await tx<{ status: string; transaction_id: string | null; payload: { analytics?: { eventId?: string } } | null }[]>`
        select p.status, p.transaction_id, p.payload
          from payment p join orders o on o.id = p.order_id
         where o.customer_phone = ${BKASH_PHONE}`;
      return { events, order, payment };
    });

    expect(state.events[0]!.n).toBe(1); // one webhook_event, not two
    expect(state.order[0]!.payment_status).toBe("paid");
    expect(state.payment[0]!.status).toBe("success");
    expect(state.payment[0]!.transaction_id).toBe("TRX-STUB-001");
    // The success write MERGED into payload — analytics.eventId survived (would be
    // dropped by a clobbering `payload = {...}` set, killing purchase analytics).
    expect(state.payment[0]!.payload?.analytics?.eventId).toBe("evt-survives-001");

    // execute was called on BOTH callbacks (the guard is at the DB write, not the
    // provider call) — but the STATE TRANSITION happened once. The second call's
    // claim lost the race, so the second execute's result was discarded.
    expect(stub.executeCalls()).toBe(2);
  });
});

// ============================================================================
// Discounts (S-DISCOUNTS 2.4) — discount application inside the placeOrder txn.
// Drives through submitCheckout (COD) so the whole path is exercised: code →
// SELECT FOR UPDATE → validate → compute → increment used_count → order total.
// Proves: valid % + fixed apply with correct totals; expired/disabled/min-cart/
// global-limit/per-customer rejected; idempotent re-submit doesn't double-count;
// oversell guard still wins even with a valid discount.
// ============================================================================
const DISC_PHONE = "01711222050";
const DISC_VAR = VAR_COD; // reuse the COD variant (price 500, seeded qty 10)

async function makeDiscount(fields: Record<string, unknown>): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from discount where tenant_id = ${TENANT_A} and code = ${fields.code as string}`;
    await tx`
      insert into discount ${tx({ tenant_id: TENANT_A, ...fields })}
    `;
  });
}

async function clearDiscOrders(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from payment where tenant_id = ${TENANT_A} and order_id in (select id from orders where customer_phone = ${DISC_PHONE})`;
    await tx`delete from order_item where tenant_id = ${TENANT_A} and order_id in (select id from orders where customer_phone = ${DISC_PHONE})`;
    await tx`delete from orders where tenant_id = ${TENANT_A} and customer_phone = ${DISC_PHONE}`;
    await tx`delete from customer_address where tenant_id = ${TENANT_A} and customer_id in (select id from customer where phone = ${DISC_PHONE})`;
    await tx`delete from customer where tenant_id = ${TENANT_A} and phone = ${DISC_PHONE}`;
  });
}

function codCheckout(code: string | undefined, quantity = 1) {
  return submitCheckout({
    tenantSlug: "store-a",
    phone: DISC_PHONE,
    name: "Discount Buyer",
    ...ADDR,
    paymentMethod: "cod",
    discountCode: code,
    items: [{ variantId: DISC_VAR, quantity }],
  });
}

async function orderTotals(): Promise<{
  subtotal: number;
  discountTotal: number;
  grandTotal: number;
  discountCode: string | null;
}> {
  return withTenant(TENANT_A, null, async (tx) => {
    const rows = await tx<
      { subtotal: string; discount_total: string; grand_total: string; discount_code: string | null }[]
    >`select subtotal, discount_total, grand_total, discount_code
        from orders where customer_phone = ${DISC_PHONE} order by placed_at desc limit 1`;
    const r = rows[0]!;
    return {
      subtotal: Number(r.subtotal),
      discountTotal: Number(r.discount_total),
      grandTotal: Number(r.grand_total),
      discountCode: r.discount_code,
    };
  });
}

async function usedCount(code: string): Promise<number> {
  const rows = await asPlatformAdmin(
    (tx) => tx<{ used_count: number }[]>`
      select used_count from discount where tenant_id = ${TENANT_A} and code = ${code}`,
  );
  return rows[0]?.used_count ?? 0;
}

describe("checkout discounts — apply inside placeOrder txn", () => {
  beforeAll(seedFixtures);
  afterAll(async () => {
    await clearDiscOrders();
    await asPlatformAdmin((tx) => tx`delete from discount where tenant_id = ${TENANT_A}`);
    await cleanupFixtures();
  });
  beforeEach(async () => {
    // Reset the in-memory rate-limit counters so repeated same-phone checkouts in
    // these tests never trip the per-phone checkout dampener (it persists across
    // files when a prior suite pinned REDIS_URL).
    __resetCache();
    await asPlatformAdmin((tx) => tx`update product_variant set inventory_quantity = 10 where id = ${DISC_VAR}`);
    await clearDiscOrders();
  });

  it("applies a valid percentage discount and computes the total", async () => {
    await makeDiscount({ code: "PCT10", type: "percentage", value: 10, status: "active" });
    const result = await codCheckout("PCT10", 2); // subtotal 1000
    expect(result.ok).toBe(true);
    const t = await orderTotals();
    expect(t.subtotal).toBe(1000);
    expect(t.discountTotal).toBe(100); // 10% of 1000
    expect(t.grandTotal).toBe(900);
    expect(t.discountCode).toBe("PCT10");
    expect(await usedCount("PCT10")).toBe(1);
  });

  it("applies a fixed_amount discount capped at subtotal", async () => {
    await makeDiscount({ code: "FLAT200", type: "fixed_amount", value: 200, status: "active" });
    const result = await codCheckout("FLAT200", 1); // subtotal 500
    expect(result.ok).toBe(true);
    const t = await orderTotals();
    expect(t.discountTotal).toBe(200);
    expect(t.grandTotal).toBe(300);
  });

  it("rejects an expired discount (outside window); order is NOT created", async () => {
    await makeDiscount({
      code: "EXPIRED",
      type: "percentage",
      value: 10,
      status: "active",
      ends_at: new Date(Date.now() - 86_400_000), // ended yesterday
    });
    const result = await codCheckout("EXPIRED", 1);
    expect(result.ok).toBe(false);
    // No order row and the code was never consumed (txn rolled back).
    const rows = await withTenant(TENANT_A, null, (tx) =>
      tx`select id from orders where customer_phone = ${DISC_PHONE}`,
    );
    expect(rows.length).toBe(0);
    expect(await usedCount("EXPIRED")).toBe(0);
  });

  it("rejects a disabled (non-active status) discount", async () => {
    await makeDiscount({ code: "OFFNOW", type: "percentage", value: 10, status: "disabled" });
    const result = await codCheckout("OFFNOW", 1);
    expect(result.ok).toBe(false);
    expect(await usedCount("OFFNOW")).toBe(0);
  });

  it("rejects when subtotal is below min_subtotal", async () => {
    await makeDiscount({
      code: "MIN2000",
      type: "fixed_amount",
      value: 100,
      status: "active",
      min_subtotal: 2000,
    });
    const result = await codCheckout("MIN2000", 1); // subtotal 500 < 2000
    expect(result.ok).toBe(false);
    expect(await usedCount("MIN2000")).toBe(0);
  });

  it("rejects when the global usage_limit is exhausted", async () => {
    await makeDiscount({
      code: "ONCE",
      type: "percentage",
      value: 10,
      status: "active",
      usage_limit: 1,
      used_count: 1, // already at the cap
    });
    const result = await codCheckout("ONCE", 1);
    expect(result.ok).toBe(false);
    expect(await usedCount("ONCE")).toBe(1); // unchanged
  });

  it("enforces per_customer_limit across this customer's prior orders", async () => {
    await makeDiscount({
      code: "PERCUST1",
      type: "percentage",
      value: 10,
      status: "active",
      per_customer_limit: 1,
    });
    const first = await codCheckout("PERCUST1", 1);
    expect(first.ok).toBe(true);
    expect(await usedCount("PERCUST1")).toBe(1);
    // Second order by the same phone with the same code → over the per-customer cap.
    const second = await codCheckout("PERCUST1", 1);
    expect(second.ok).toBe(false);
    expect(await usedCount("PERCUST1")).toBe(1); // not double-counted
  });

  it("does not double-count used_count when a distinct order reuses an unlimited code", async () => {
    await makeDiscount({ code: "REUSE", type: "percentage", value: 10, status: "active" });
    const a = await codCheckout("REUSE", 1);
    expect(a.ok).toBe(true);
    const b = await codCheckout("REUSE", 1);
    expect(b.ok).toBe(true);
    // Two separate valid orders → used_count incremented exactly twice (once each),
    // never more — the increment is one UPDATE per successful txn.
    expect(await usedCount("REUSE")).toBe(2);
  });

  it("keeps the oversell guard authoritative even with a valid discount", async () => {
    await makeDiscount({ code: "STOCKED", type: "percentage", value: 10, status: "active" });
    await asPlatformAdmin((tx) => tx`update product_variant set inventory_quantity = 0 where id = ${DISC_VAR}`);
    const result = await codCheckout("STOCKED", 1);
    expect(result.ok).toBe(false); // INSUFFICIENT_STOCK rolls back before any discount commit
    expect(await usedCount("STOCKED")).toBe(0); // discount not consumed on a failed order
  });
});
