import "server-only";

// Marketplace wishlist — buyer adds/removes/lists saved products.
// Runs under withBuyer (RLS scoped to buyer_id). No platform-admin needed.
import { withBuyer, withPublic } from "@hybrid/db";
import type { MpListing } from "./data";

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getWishlistProductIds(buyerId: string): Promise<Set<string>> {
  const rows = await withBuyer(buyerId, (tx) =>
    tx<{ product_id: string }[]>`
      select product_id from marketplace_wishlist where buyer_id = ${buyerId}
    `,
  );
  return new Set(rows.map((r) => r.product_id));
}

export async function getWishlistItems(buyerId: string): Promise<MpListing[]> {
  const rows = await withBuyer(buyerId, (tx) =>
    tx<{ listing_id: string }[]>`
      select listing_id from marketplace_wishlist
       where buyer_id = ${buyerId}
       order by created_at desc
    `,
  );
  if (rows.length === 0) return [];

  const listingIds = rows.map((r) => r.listing_id);
  const listings = await withPublic((tx) =>
    tx<{
      product_id: string; tenant_id: string; vendor_slug: string; slug: string;
      title: string; vendor_name: string; price_from: string; image_url: string | null;
      in_stock: boolean; rating_avg: string; rating_count: number;
      is_wholesale: boolean; wholesale_only: boolean; moq: number | null;
    }[]>`
      select product_id, tenant_id, vendor_slug, slug, title, vendor_name,
             price_from, image_url, in_stock, rating_avg, rating_count,
             is_wholesale, wholesale_only, moq
        from marketplace_listing
       where id in ${tx(listingIds)}
         and status = 'active' and hidden = false
    `,
  );
  return listings.map((r) => ({
    productId: r.product_id,
    tenantId: r.tenant_id,
    vendorSlug: r.vendor_slug,
    productSlug: r.slug,
    title: r.title,
    vendorName: r.vendor_name,
    priceFrom: Number(r.price_from),
    imageUrl: r.image_url,
    inStock: r.in_stock,
    ratingAvg: Number(r.rating_avg),
    ratingCount: r.rating_count,
    isWholesale: r.is_wholesale,
    wholesaleOnly: r.wholesale_only,
    moq: r.moq,
  }));
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function addToWishlist(
  buyerId: string,
  productId: string,
  listingId: string,
): Promise<void> {
  await withBuyer(buyerId, (tx) =>
    tx`
      insert into marketplace_wishlist (buyer_id, product_id, listing_id)
      values (${buyerId}, ${productId}, ${listingId})
      on conflict (buyer_id, product_id) do nothing
    `,
  );
}

export async function removeFromWishlist(buyerId: string, productId: string): Promise<void> {
  await withBuyer(buyerId, (tx) =>
    tx`
      delete from marketplace_wishlist
       where buyer_id = ${buyerId} and product_id = ${productId}
    `,
  );
}
