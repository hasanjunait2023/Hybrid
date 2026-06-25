// ============================================================================
// Product reviews slice (tenant roadmap P3-1). Embedded Postgres,
// app_runtime_login (RLS). Exercises apps/web/lib/admin/reviews.ts.
//
// Proves: createReview is pending; moderate approves/rejects; getProductRating
// averages approved only; rating range validated; cross-tenant RLS isolation.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import {
  createReview,
  listReviews,
  moderateReview,
  getProductRating,
  getReviewStats,
} from "../../../apps/web/lib/admin/reviews";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b";
const OWNER_A = "11111111-1111-1111-1111-111111111001";
const OWNER_B = "11111111-1111-1111-1111-111111111002";

const RV_PROD = "e0000015-0000-0000-0000-000000000e15";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from product_review where tenant_id = ${TENANT_A}`;
    await tx`delete from product where id = ${RV_PROD}`;
  });
}

describe("product reviews slice (P3-1)", () => {
  let r1 = "";
  let r2 = "";

  beforeAll(async () => {
    await cleanup();
    await asPlatformAdmin(async (tx) => {
      await tx`
        insert into product (id, tenant_id, title, slug, status) values
          (${RV_PROD}, ${TENANT_A}, 'Review Item', 'review-item', 'active')
      `;
    });
  });

  afterAll(cleanup);

  it("1. createReview is pending; rating range validated", async () => {
    ({ id: r1 } = await createReview(TENANT_A, OWNER_A, {
      productId: RV_PROD, customerName: "Karim", rating: 5, body: "ভালো পণ্য",
    }));
    ({ id: r2 } = await createReview(TENANT_A, OWNER_A, {
      productId: RV_PROD, customerName: "Rahim", rating: 3,
    }));
    const pending = await listReviews(TENANT_A, OWNER_A, "pending");
    expect(pending.filter((r) => r.productId === RV_PROD)).toHaveLength(2);

    await expect(
      createReview(TENANT_A, OWNER_A, { productId: RV_PROD, rating: 6 }),
    ).rejects.toThrow();
  });

  it("2. moderate approves/rejects; rating averages approved only", async () => {
    await moderateReview(TENANT_A, OWNER_A, r1, "approved"); // 5★
    await moderateReview(TENANT_A, OWNER_A, r2, "rejected"); // excluded

    const rating = await getProductRating(TENANT_A, OWNER_A, RV_PROD);
    expect(rating.count).toBe(1);
    expect(rating.average).toBe(5);

    // Add a second approved (4★) → average (5+4)/2 = 4.5.
    const { id } = await createReview(TENANT_A, OWNER_A, { productId: RV_PROD, rating: 4 });
    await moderateReview(TENANT_A, OWNER_A, id, "approved");
    const rating2 = await getProductRating(TENANT_A, OWNER_A, RV_PROD);
    expect(rating2.count).toBe(2);
    expect(rating2.average).toBeCloseTo(4.5, 2);
  });

  it("3. stats reflect pending/approved", async () => {
    const stats = await getReviewStats(TENANT_A, OWNER_A);
    expect(stats.approved).toBeGreaterThanOrEqual(2);
    expect(stats.avgRating).toBeGreaterThan(0);
  });

  it("4. cross-tenant: tenant B sees no review or rating for A's product (RLS)", async () => {
    const listB = await listReviews(TENANT_B, OWNER_B);
    expect(listB.find((r) => r.id === r1)).toBeUndefined();
    const ratingB = await getProductRating(TENANT_B, OWNER_B, RV_PROD);
    expect(ratingB.count).toBe(0);
  });
});
