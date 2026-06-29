// Product reviews data layer (tenant roadmap P3-1). All via withTenant (RLS).
// Customers submit (pending); the seller approves/rejects; approved reviews +
// the average rating surface on the storefront. createReview is the path the
// storefront review form uses; the rest power the admin moderation queue.
import { withTenant } from "@hybrid/db";

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface Review {
  id: string;
  productId: string;
  productTitle: string | null;
  customerName: string | null;
  rating: number;
  body: string | null;
  status: ReviewStatus;
  createdAt: string;
}

export interface CreateReviewInput {
  productId: string;
  orderId?: string;
  customerId?: string;
  customerName?: string;
  rating: number;
  body?: string;
}

export async function createReview(
  tenantId: string,
  userId: string | null,
  input: CreateReviewInput,
): Promise<{ id: string }> {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new Error("RATING_RANGE");
  }
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ id: string }[]>`
      insert into product_review (tenant_id, product_id, order_id, customer_id, customer_name, rating, body)
      values (
        ${tenantId}, ${input.productId}, ${input.orderId ?? null}, ${input.customerId ?? null},
        ${input.customerName ?? null}, ${input.rating}, ${input.body ?? null}
      )
      returning id
    `,
  );
  return { id: rows[0]!.id };
}

export async function listReviews(
  tenantId: string,
  userId: string,
  status?: ReviewStatus,
): Promise<Review[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      {
        id: string;
        product_id: string;
        product_title: string | null;
        customer_name: string | null;
        rating: number;
        body: string | null;
        status: ReviewStatus;
        created_at: string;
      }[]
    >`
      select r.id, r.product_id, p.title as product_title, r.customer_name,
             r.rating, r.body, r.status, r.created_at
      from product_review r
      left join product p on p.id = r.product_id
      where (${status ?? null}::text is null or r.status = ${status ?? null})
      order by r.created_at desc
      limit 200
    `,
  );
  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    productTitle: r.product_title,
    customerName: r.customer_name,
    rating: r.rating,
    body: r.body,
    status: r.status,
    createdAt: r.created_at,
  }));
}

export async function moderateReview(
  tenantId: string,
  userId: string,
  reviewId: string,
  status: "approved" | "rejected",
): Promise<void> {
  await withTenant(tenantId, userId, async (tx) => {
    await tx`
      update product_review set status = ${status}, moderated_at = now()
      where id = ${reviewId}
    `;
  });
}

export interface ProductRating {
  average: number;
  count: number;
}

// Approved-only aggregate for the storefront product page.
export async function getProductRating(
  tenantId: string,
  userId: string,
  productId: string,
): Promise<ProductRating> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ avg: string | null; n: number }[]>`
      select avg(rating)::numeric(3,2) as avg, count(*)::int as n
      from product_review
      where product_id = ${productId} and status = 'approved'
    `,
  );
  return { average: Number(rows[0]?.avg ?? 0), count: rows[0]?.n ?? 0 };
}

export interface ReviewStats {
  pending: number;
  approved: number;
  avgRating: number;
}

export async function getReviewStats(tenantId: string, userId: string): Promise<ReviewStats> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ pending: number; approved: number; avg: string | null }[]>`
      select
        count(*) filter (where status = 'pending')::int as pending,
        count(*) filter (where status = 'approved')::int as approved,
        avg(rating) filter (where status = 'approved')::numeric(3,2) as avg
      from product_review
    `,
  );
  const r = rows[0];
  return { pending: r?.pending ?? 0, approved: r?.approved ?? 0, avgRating: Number(r?.avg ?? 0) };
}
