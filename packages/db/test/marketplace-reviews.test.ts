// ============================================================================
// Marketplace reviews suite (M5). Verified-purchase gate, vendor moderation,
// rating rollup, and cross-buyer isolation — against the real review module.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import { upsertBuyerByPhone } from "@/lib/marketplace/session";
import { placeMarketplaceOrder } from "@/lib/marketplace/placeMarketplaceOrder";
import { syncMarketplaceListing } from "@/lib/marketplace/sync";
import {
  submitReview,
  getProductReviews,
  listPendingReviews,
  moderateReview,
} from "@/lib/marketplace/reviews";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const OWNER_A = "11111111-1111-1111-1111-111111111001";
const PROD_A = "a0000001-0000-0000-0000-0000000000a1";
const PHONE_BUYER = "+8801713000001";
const PHONE_OTHER = "+8801713000002";

let buyerId = "";
let otherBuyerId = "";

const contact = { name: "Reviewer", phone: PHONE_BUYER };
const shipTo = { division: "Dhaka", district: "Dhaka", thana: "Gulshan", line: "Road 1" };

describe("Marketplace reviews", () => {
  beforeAll(async () => {
    await asPlatformAdmin((tx) => tx`delete from marketplace_customer where phone in (${PHONE_BUYER}, ${PHONE_OTHER})`);
    buyerId = await upsertBuyerByPhone(PHONE_BUYER, "Reviewer");
    otherBuyerId = await upsertBuyerByPhone(PHONE_OTHER, "Other");
    await syncMarketplaceListing(TENANT_A, PROD_A);

    const variant = await asPlatformAdmin((tx) =>
      tx<{ id: string }[]>`select id from product_variant where product_id = ${PROD_A} limit 1`,
    );
    const placed = await placeMarketplaceOrder({
      buyerId,
      contact,
      shipTo,
      lines: [{ tenantId: TENANT_A, variantId: variant[0]!.id, quantity: 1 }],
    });
    // Mark the vendor order delivered so the verified-purchase gate passes.
    await asPlatformAdmin((tx) =>
      tx`update orders set fulfillment_status = 'delivered' where marketplace_order_id = ${placed.marketplaceOrderId}`,
    );
  });

  afterAll(async () => {
    await asPlatformAdmin(async (tx) => {
      await tx`delete from marketplace_review where buyer_id in (${buyerId}, ${otherBuyerId})`;
      const parents = await tx<{ id: string }[]>`select id from marketplace_order where buyer_id = ${buyerId}`;
      const pids = parents.map((p) => p.id);
      if (pids.length) {
        const orders = await tx<{ id: string }[]>`select id from orders where marketplace_order_id in ${tx(pids)}`;
        const oids = orders.map((o) => o.id);
        if (oids.length) {
          await tx`delete from payment where order_id in ${tx(oids)}`;
          await tx`delete from order_item where order_id in ${tx(oids)}`;
        }
        await tx`delete from marketplace_commission where marketplace_order_id in ${tx(pids)}`;
        await tx`delete from marketplace_suborder where marketplace_order_id in ${tx(pids)}`;
        if (oids.length) await tx`delete from orders where id in ${tx(oids)}`;
        await tx`delete from marketplace_order where id in ${tx(pids)}`;
      }
      await tx`delete from marketplace_customer where id in (${buyerId}, ${otherBuyerId})`;
    });
  });

  it("1. a buyer without a delivered purchase is blocked", async () => {
    const outcome = await submitReview(otherBuyerId, PROD_A, 5, "nice");
    expect(outcome).toBe("not_purchased");
  });

  it("2. a verified buyer can submit; it starts pending (hidden from public)", async () => {
    const outcome = await submitReview(buyerId, PROD_A, 5, "valo product");
    expect(outcome).toBe("ok");
    const publicReviews = await getProductReviews(PROD_A);
    expect(publicReviews.find((r) => r.body === "valo product")).toBeUndefined();
  });

  it("3. vendor approval publishes it and updates the listing rollup", async () => {
    const pending = await listPendingReviews(TENANT_A, OWNER_A);
    const mine = pending.find((p) => p.productId === PROD_A);
    expect(mine).toBeDefined();

    await moderateReview(TENANT_A, OWNER_A, mine!.id, true);

    const publicReviews = await getProductReviews(PROD_A);
    expect(publicReviews.some((r) => r.body === "valo product" && r.verifiedPurchase)).toBe(true);

    const listing = await asPlatformAdmin((tx) =>
      tx<{ rating_avg: string; rating_count: number }[]>`
        select rating_avg, rating_count from marketplace_listing where product_id = ${PROD_A}
      `,
    );
    expect(listing[0]?.rating_count).toBe(1);
    expect(Number(listing[0]?.rating_avg)).toBe(5);
  });

  it("4. rejection unpublishes and zeroes the rollup", async () => {
    const approved = await asPlatformAdmin((tx) =>
      tx<{ id: string }[]>`select id from marketplace_review where product_id = ${PROD_A} and buyer_id = ${buyerId}`,
    );
    await moderateReview(TENANT_A, OWNER_A, approved[0]!.id, false);
    const publicReviews = await getProductReviews(PROD_A);
    expect(publicReviews.some((r) => r.body === "valo product")).toBe(false);
    const listing = await asPlatformAdmin((tx) =>
      tx<{ rating_count: number }[]>`select rating_count from marketplace_listing where product_id = ${PROD_A}`,
    );
    expect(listing[0]?.rating_count).toBe(0);
  });
});
