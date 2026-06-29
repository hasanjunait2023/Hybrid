import "server-only";

// Marketplace reviews (M5). Buyer submits on a DELIVERED purchase; vendor
// moderates; approved reviews show publicly + roll into the listing rating.
import { withPublic, withBuyer, withTenant, asPlatformAdmin } from "@hybrid/db";

export interface PublicReview {
  id: string;
  rating: number;
  body: string | null;
  verifiedPurchase: boolean;
}

// Approved reviews for a product (public PDP). withPublic → mr_select_public.
export async function getProductReviews(productId: string): Promise<PublicReview[]> {
  const rows = await withPublic((tx) =>
    tx<{ id: string; rating: number; body: string | null; verified_purchase: boolean }[]>`
      select id, rating, body, verified_purchase
        from marketplace_review
       where product_id = ${productId} and status = 'approved'
       order by created_at desc limit 50
    `,
  );
  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    body: r.body,
    verifiedPurchase: r.verified_purchase,
  }));
}

export type SubmitReviewOutcome = "ok" | "not_purchased" | "invalid";

// Submit (or update) a review. Requires a DELIVERED sub-order for this buyer
// containing the product — the verified-purchase gate. The purchase check spans
// buyer + tenant order data, so it runs under asPlatformAdmin; the INSERT runs
// under withBuyer so RLS proves buyer_id = current_buyer.
export async function submitReview(
  buyerId: string,
  productId: string,
  rating: number,
  body: string | null,
): Promise<SubmitReviewOutcome> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return "invalid";

  const gate = await asPlatformAdmin((tx) =>
    tx<{ tenant_id: string }[]>`
      select o.tenant_id
        from marketplace_suborder ms
        join orders o on o.id = ms.order_id
        join order_item oi on oi.order_id = o.id
       where ms.buyer_id = ${buyerId}
         and oi.product_id = ${productId}
         and o.fulfillment_status = 'delivered'
       limit 1
    `,
  );
  const tenantId = gate[0]?.tenant_id;
  if (!tenantId) return "not_purchased";

  await withBuyer(buyerId, (tx) =>
    tx`
      insert into marketplace_review (buyer_id, product_id, tenant_id, rating, body, verified_purchase, status)
      values (${buyerId}, ${productId}, ${tenantId}, ${rating}, ${body}, true, 'pending')
      on conflict (buyer_id, product_id) do update set
        rating = excluded.rating, body = excluded.body, status = 'pending'
    `,
  );
  return "ok";
}

// --- Vendor moderation -------------------------------------------------------

export interface PendingReview {
  id: string;
  productId: string;
  productTitle: string;
  rating: number;
  body: string | null;
}

// Pending reviews for the vendor's own products (admin moderation queue).
export async function listPendingReviews(
  tenantId: string,
  userId: string,
): Promise<PendingReview[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ id: string; product_id: string; title: string; rating: number; body: string | null }[]>`
      select r.id, r.product_id, p.title, r.rating, r.body
        from marketplace_review r
        join product p on p.id = r.product_id
       where r.tenant_id = ${tenantId} and r.status = 'pending'
       order by r.created_at asc
    `,
  );
  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    productTitle: r.title,
    rating: r.rating,
    body: r.body,
  }));
}

// Approve/reject one review (vendor owns the tenant_id). On a status change we
// recompute that product's rating rollup so the public listing updates at once
// (the cron is the backstop).
export async function moderateReview(
  tenantId: string,
  userId: string,
  reviewId: string,
  approve: boolean,
): Promise<void> {
  const updated = await withTenant(tenantId, userId, (tx) =>
    tx<{ product_id: string }[]>`
      update marketplace_review
         set status = ${approve ? "approved" : "rejected"}, moderated_at = now()
       where id = ${reviewId} and tenant_id = ${tenantId}
       returning product_id
    `,
  );
  const productId = updated[0]?.product_id;
  if (!productId) return;

  await asPlatformAdmin((tx) =>
    tx`
      update marketplace_listing ml set
        rating_count = sub.cnt,
        rating_avg   = coalesce(sub.avg, 0)
      from (
        select count(*)::int as cnt, round(avg(rating)::numeric, 2) as avg
          from marketplace_review where product_id = ${productId} and status = 'approved'
      ) sub
      where ml.product_id = ${productId}
    `,
  );
}
