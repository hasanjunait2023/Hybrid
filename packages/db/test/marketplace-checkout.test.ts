// ============================================================================
// Marketplace split-cart checkout suite (M3). Exercises the real orchestrator
// (apps/web/lib/marketplace/placeMarketplaceOrder.ts) against the embedded
// Postgres: one buyer's cross-vendor cart → one COD sub-order per vendor under a
// marketplace_order parent, with commission ledger rows. Covers the happy path,
// the partial-failure (out-of-stock) saga branch, and idempotent re-submit.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { asPlatformAdmin } from "../src/index";
import { upsertBuyerByPhone } from "@/lib/marketplace/session";
import { placeMarketplaceOrder } from "@/lib/marketplace/placeMarketplaceOrder";
import { backfillMissingSuborders, recoverStalledOrders } from "@/lib/marketplace/reconcile";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b";
const PROD_A = "a0000001-0000-0000-0000-0000000000a1";
const PROD_B = "b0000001-0000-0000-0000-0000000000b1";
const PHONE = "+8801712000001";

let buyerId = "";
let variantA = "";
let priceA = 0;
let variantB = "";
let priceB = 0;

const contact = { name: "Bazar Buyer", phone: PHONE };
const shipTo = { division: "Dhaka", district: "Dhaka", thana: "Gulshan", line: "Road 1" };

async function variant(productId: string): Promise<{ id: string; price: number }> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ id: string; price: string }[]>`
      select id, price from product_variant where product_id = ${productId} order by position asc limit 1
    `,
  );
  return { id: rows[0]!.id, price: Number(rows[0]!.price) };
}

async function cleanupBuyerOrders(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    const parents = await tx<{ id: string }[]>`
      select id from marketplace_order where buyer_id = ${buyerId}
    `;
    const parentIds = parents.map((p) => p.id);
    if (parentIds.length > 0) {
      const orders = await tx<{ id: string }[]>`
        select id from orders where marketplace_order_id in ${tx(parentIds)}
      `;
      const orderIds = orders.map((o) => o.id);
      if (orderIds.length > 0) {
        await tx`delete from payment where order_id in ${tx(orderIds)}`;
        await tx`delete from order_item where order_id in ${tx(orderIds)}`;
      }
      await tx`delete from marketplace_commission where marketplace_order_id in ${tx(parentIds)}`;
      await tx`delete from marketplace_suborder where marketplace_order_id in ${tx(parentIds)}`;
      if (orderIds.length > 0) await tx`delete from orders where id in ${tx(orderIds)}`;
      await tx`delete from marketplace_order where id in ${tx(parentIds)}`;
    }
  });
}

describe("Marketplace split-cart checkout", () => {
  beforeAll(async () => {
    await asPlatformAdmin((tx) => tx`delete from marketplace_customer where phone = ${PHONE}`);
    buyerId = await upsertBuyerByPhone(PHONE, "Bazar Buyer");
    const va = await variant(PROD_A);
    const vb = await variant(PROD_B);
    variantA = va.id;
    priceA = va.price;
    variantB = vb.id;
    priceB = vb.price;
  });

  afterAll(async () => {
    await cleanupBuyerOrders();
    await asPlatformAdmin((tx) => tx`delete from marketplace_customer where id = ${buyerId}`);
  });

  it("1. a 2-vendor cart splits into 2 COD sub-orders under one parent", async () => {
    const result = await placeMarketplaceOrder({
      buyerId,
      contact,
      shipTo,
      lines: [
        { tenantId: TENANT_A, variantId: variantA, quantity: 1 },
        { tenantId: TENANT_B, variantId: variantB, quantity: 1 },
      ],
    });

    expect(result.status).toBe("confirmed");
    expect(result.confirmed.length).toBe(2);
    expect(result.failed.length).toBe(0);

    const mpId = result.marketplaceOrderId;

    // Two tenant orders, both marketplace-channel COD, fulfillment confirmed.
    const orders = await asPlatformAdmin((tx) =>
      tx<
        { tenant_id: string; channel: string; cod_amount: string; grand_total: string; fulfillment_status: string }[]
      >`
        select tenant_id, channel, cod_amount, grand_total, fulfillment_status
          from orders where marketplace_order_id = ${mpId} order by tenant_id
      `,
    );
    expect(orders.length).toBe(2);
    expect(orders.every((o) => o.channel === "marketplace")).toBe(true);
    expect(orders.every((o) => o.fulfillment_status === "confirmed")).toBe(true);
    expect(orders.every((o) => o.cod_amount === o.grand_total)).toBe(true);

    // Both payments are COD.
    const pay = await asPlatformAdmin((tx) =>
      tx<{ provider: string }[]>`
        select p.provider from payment p
          join orders o on o.id = p.order_id
         where o.marketplace_order_id = ${mpId}
      `,
    );
    expect(pay.length).toBe(2);
    expect(pay.every((p) => p.provider === "cod")).toBe(true);

    // Two sub-orders + two commission rows (5% of items subtotal).
    const subs = await asPlatformAdmin((tx) =>
      tx<{ tenant_id: string; items_subtotal: string }[]>`
        select tenant_id, items_subtotal from marketplace_suborder where marketplace_order_id = ${mpId}
      `,
    );
    expect(subs.length).toBe(2);

    const commissions = await asPlatformAdmin((tx) =>
      tx<{ tenant_id: string; gross: string; commission_amount: string }[]>`
        select tenant_id, gross, commission_amount from marketplace_commission where marketplace_order_id = ${mpId}
      `,
    );
    expect(commissions.length).toBe(2);
    const cA = commissions.find((c) => c.tenant_id === TENANT_A)!;
    expect(Number(cA.gross)).toBe(priceA);
    expect(Number(cA.commission_amount)).toBeCloseTo(Math.round(priceA * 0.05 * 100) / 100, 2);

    // Parent totals.
    const parent = await asPlatformAdmin((tx) =>
      tx<{ status: string; items_total: string; vendor_count: number }[]>`
        select status, items_total, vendor_count from marketplace_order where id = ${mpId}
      `,
    );
    expect(parent[0]?.status).toBe("confirmed");
    expect(parent[0]?.vendor_count).toBe(2);
    expect(Number(parent[0]?.items_total)).toBe(priceA + priceB);
  });

  it("2. an out-of-stock vendor yields a PARTIAL order (others still commit)", async () => {
    const bogusVariant = randomUUID(); // no such variant → InsufficientStockError
    const result = await placeMarketplaceOrder({
      buyerId,
      contact,
      shipTo,
      lines: [
        { tenantId: TENANT_A, variantId: variantA, quantity: 1 },
        { tenantId: TENANT_B, variantId: bogusVariant, quantity: 1 },
      ],
    });

    expect(result.status).toBe("partial");
    expect(result.confirmed.length).toBe(1);
    expect(result.confirmed[0]?.tenantId).toBe(TENANT_A);
    expect(result.failed.length).toBe(1);
    expect(result.failed[0]?.tenantId).toBe(TENANT_B);
    expect(result.failed[0]?.reason).toBe("out_of_stock");

    // Exactly one tenant order under the parent (vendor A only).
    const orders = await asPlatformAdmin((tx) =>
      tx<{ tenant_id: string }[]>`
        select tenant_id from orders where marketplace_order_id = ${result.marketplaceOrderId}
      `,
    );
    expect(orders.length).toBe(1);
    expect(orders[0]?.tenant_id).toBe(TENANT_A);
  });

  it("3. re-submitting with the same idempotency key returns the existing parent", async () => {
    const key = "mp-idem-key-1";
    const first = await placeMarketplaceOrder({
      buyerId,
      contact,
      shipTo,
      idempotencyKey: key,
      lines: [{ tenantId: TENANT_A, variantId: variantA, quantity: 1 }],
    });
    expect(first.replayed).toBe(false);
    expect(first.status).toBe("confirmed");

    const second = await placeMarketplaceOrder({
      buyerId,
      contact,
      shipTo,
      idempotencyKey: key,
      lines: [{ tenantId: TENANT_A, variantId: variantA, quantity: 1 }],
    });
    expect(second.replayed).toBe(true);
    expect(second.marketplaceOrderId).toBe(first.marketplaceOrderId);

    // Only ONE parent carries that key.
    const dupes = await asPlatformAdmin((tx) =>
      tx<{ n: number }[]>`
        select count(*)::int as n from marketplace_order where idempotency_key = ${key}
      `,
    );
    expect(dupes[0]?.n).toBe(1);
  });

  it("4. reconcile backfills orphaned sub-orders when the bridge crashed mid-saga", async () => {
    // A clean 2-vendor order, then simulate the orchestrator crashing in step 3
    // (the asPlatformAdmin bridge) AFTER both tenant orders committed: drop the
    // sub-order + commission rows and strand the parent in 'pending'.
    const placed = await placeMarketplaceOrder({
      buyerId,
      contact,
      shipTo,
      lines: [
        { tenantId: TENANT_A, variantId: variantA, quantity: 1 },
        { tenantId: TENANT_B, variantId: variantB, quantity: 1 },
      ],
    });
    const mpId = placed.marketplaceOrderId;

    await asPlatformAdmin(async (tx) => {
      await tx`delete from marketplace_commission where marketplace_order_id = ${mpId}`;
      await tx`delete from marketplace_suborder where marketplace_order_id = ${mpId}`;
      await tx`
        update marketplace_order
           set status = 'pending', created_at = now() - interval '16 minutes'
         where id = ${mpId}
      `;
    });

    // Backfill recreates exactly the two missing sub-orders (the tenant orders
    // were never deleted) and their commission rows.
    const recreated = await backfillMissingSuborders();
    expect(recreated).toBe(2);

    const after = await asPlatformAdmin((tx) =>
      tx<{ subs: number; comms: number }[]>`
        select
          (select count(*)::int from marketplace_suborder where marketplace_order_id = ${mpId})  as subs,
          (select count(*)::int from marketplace_commission where marketplace_order_id = ${mpId}) as comms
      `,
    );
    expect(after[0]?.subs).toBe(2);
    expect(after[0]?.comms).toBe(2);

    // Sub-orders are value-linked to the real tenant orders.
    const linked = await asPlatformAdmin((tx) =>
      tx<{ n: number }[]>`
        select count(*)::int as n
          from marketplace_suborder s
          join orders o on o.id = s.order_id and o.tenant_id = s.tenant_id
         where s.marketplace_order_id = ${mpId}
      `,
    );
    expect(linked[0]?.n).toBe(2);

    // A second pass is a no-op (keyed on the missing sub-order — no double-write).
    expect(await backfillMissingSuborders()).toBe(0);

    // Saga recovery now finalizes the parent from the real counts: 2 == vendor_count.
    await recoverStalledOrders();
    const parent = await asPlatformAdmin((tx) =>
      tx<{ status: string }[]>`select status from marketplace_order where id = ${mpId}`,
    );
    expect(parent[0]?.status).toBe("confirmed");
  });
});
