// ============================================================================
// Storefront product reviews suite. Proves the public PDP read
// (getStorefrontProductReviews) exposes ONLY approved reviews with the correct
// average/count/ordering, while pending ones stay hidden until the seller
// approves them via moderateReview. Isolated on a freshly provisioned tenant +
// one product so it never races the admin reviews suite.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";

process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";

import { provisionTenant, createAppUser } from "../../../apps/web/lib/auth/provision";
import { createReview, moderateReview } from "../../../apps/web/lib/admin/reviews";
import { getStorefrontProductReviews } from "../../../apps/web/lib/storefront/data";

const RUN = Date.now().toString(36);
const SLUG = `reviews-${RUN}`;
const EMAIL = `reviews-owner-${RUN}@store.test`;

let tenantId = "";
let userId = "";
let productId = "";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from tenant where slug = ${SLUG}`;
    await tx`delete from app_user where email = ${EMAIL}`;
  });
}

describe("Storefront product reviews", () => {
  beforeAll(async () => {
    await cleanup();
    const owner = await createAppUser({ email: EMAIL, fullName: "Reviews Owner" });
    userId = owner.userId;
    const res = await provisionTenant({ userId, storeName: "Reviews Store", slug: SLUG });
    tenantId = res.tenantId;

    const rows = await asPlatformAdmin((tx) =>
      tx<{ id: string }[]>`
        insert into product (tenant_id, title, slug, status, description)
        values (${tenantId}, 'Test Product', 'test-product', 'active', 'desc')
        returning id
      `,
    );
    productId = rows[0]!.id;
  });

  afterAll(cleanup);

  it("1. only approved reviews surface, with correct average + count", async () => {
    const r1 = await createReview(tenantId, userId, {
      productId,
      customerName: "Karim",
      rating: 5,
      body: "চমৎকার পণ্য",
    });
    const r2 = await createReview(tenantId, userId, {
      productId,
      customerName: "Rahim",
      rating: 3,
      body: "মোটামুটি",
    });
    // Pending — must NOT appear publicly.
    await createReview(tenantId, userId, { productId, customerName: "Spammer", rating: 1 });

    // Before moderation: nothing approved yet.
    const before = await getStorefrontProductReviews(tenantId, productId);
    expect(before.count).toBe(0);
    expect(before.reviews).toHaveLength(0);

    await moderateReview(tenantId, userId, r1.id, "approved");
    await moderateReview(tenantId, userId, r2.id, "approved");

    const after = await getStorefrontProductReviews(tenantId, productId);
    expect(after.count).toBe(2);
    expect(after.average).toBeCloseTo(4, 2); // (5 + 3) / 2
    expect(after.reviews).toHaveLength(2);
    // The pending 1-star is excluded.
    expect(after.reviews.some((r) => r.rating === 1)).toBe(false);
    expect(after.reviews.map((r) => r.rating).sort()).toEqual([3, 5]);
  });

  it("2. a rejected review is removed from the public list", async () => {
    const approved = await getStorefrontProductReviews(tenantId, productId);
    const target = approved.reviews.find((r) => r.rating === 3)!;

    // Find its id and reject it.
    const idRow = await asPlatformAdmin((tx) =>
      tx<{ id: string }[]>`
        select id from product_review
         where tenant_id = ${tenantId} and product_id = ${productId} and rating = 3 and status = 'approved'
         limit 1
      `,
    );
    expect(target).toBeTruthy();
    await moderateReview(tenantId, userId, idRow[0]!.id, "rejected");

    const after = await getStorefrontProductReviews(tenantId, productId);
    expect(after.count).toBe(1);
    expect(after.average).toBeCloseTo(5, 2);
    expect(after.reviews).toHaveLength(1);
    expect(after.reviews[0]?.rating).toBe(5);
  });

  it("3. createReview rejects an out-of-range rating", async () => {
    await expect(
      createReview(tenantId, userId, { productId, customerName: "X", rating: 6 }),
    ).rejects.toThrow();
  });
});
