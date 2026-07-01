import "server-only";

// Marketplace read layer (M4). Public catalog reads run under withPublic (the
// anonymous, RLS-on path — world-readable projection only, never asPlatformAdmin).
// Buyer order history runs under withBuyer.
import { withPublic, withBuyer } from "@hybrid/db";
import type { Tx } from "@hybrid/db";

export interface MpListing {
  productId: string;
  tenantId: string;
  vendorSlug: string;
  productSlug: string;
  title: string;
  vendorName: string;
  priceFrom: number;
  imageUrl: string | null;
  inStock: boolean;
  ratingAvg: number;
  ratingCount: number;
  /** Wholesale fields (null for retail-only products) */
  isWholesale: boolean;
  wholesaleOnly: boolean;
  moq: number | null;
}

export interface MpCategory {
  slug: string;
  nameBn: string;
  nameEn: string;
}

interface ListingRow {
  product_id: string;
  tenant_id: string;
  vendor_slug: string;
  slug: string;
  title: string;
  vendor_name: string;
  price_from: string;
  image_url: string | null;
  in_stock: boolean;
  rating_avg: string;
  rating_count: number;
  is_wholesale: boolean;
  wholesale_only: boolean;
  moq: number | null;
}

function toListing(r: ListingRow): MpListing {
  return {
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
  };
}

export type MpSort = "relevance" | "newest" | "price_asc" | "price_desc" | "rating";

export interface MpListPage {
  items: MpListing[];
  /** true when a further page exists (one extra row was fetched to detect it). */
  hasMore: boolean;
  page: number;
  sort: MpSort;
}

const DEFAULT_PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 60;

// Build the ORDER BY as a nested sql fragment (postgres.js inlines fragments and
// merges their params) — `sort` is a closed union, so no user string ever reaches
// the clause. Relevance only applies to a text search; it falls back to newest
// for plain browse/category.
function orderFragment(tx: Tx, sort: MpSort, q: string | null) {
  switch (sort) {
    case "price_asc":
      return tx`price_from asc, rating_avg desc`;
    case "price_desc":
      return tx`price_from desc, rating_avg desc`;
    case "rating":
      return tx`rating_avg desc, rating_count desc`;
    case "newest":
      return tx`synced_at desc`;
    case "relevance":
    default:
      return q
        ? tx`ts_rank(search_tsv, plainto_tsquery('simple', ${q})) desc, rating_avg desc`
        : tx`rating_avg desc, synced_at desc`;
  }
}

// Browse / search / category in ONE query, with sort + offset pagination.
// q → full-text; categorySlug → filter; both optional and composable.
export async function listMarketplaceProducts(opts: {
  q?: string;
  categorySlug?: string;
  sort?: MpSort;
  /** 1-based. */
  page?: number;
  pageSize?: number;
} = {}): Promise<MpListPage> {
  const q = opts.q?.trim() || null;
  const cat = opts.categorySlug?.trim() || null;
  const pageSize = Math.min(Math.max(1, Math.floor(opts.pageSize ?? DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE);
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const offset = (page - 1) * pageSize;
  const sort: MpSort = opts.sort ?? (q ? "relevance" : "newest");

  const rows = await withPublic((tx) => {
    const order = orderFragment(tx, sort, q);
    // Fetch one extra row to know whether a next page exists.
    return tx<ListingRow[]>`
      select product_id, tenant_id, vendor_slug, slug, title, vendor_name,
             price_from, image_url, in_stock, rating_avg, rating_count,
             is_wholesale, wholesale_only, moq
        from marketplace_listing
       where status = 'active' and hidden = false
         and (${q}::text is null or search_tsv @@ plainto_tsquery('simple', ${q}))
         and (${cat}::text is null
              or category_id = (select id from marketplace_category where slug = ${cat}))
       order by ${order}
       limit ${pageSize + 1} offset ${offset}
    `;
  });

  const hasMore = rows.length > pageSize;
  return { items: rows.slice(0, pageSize).map(toListing), hasMore, page, sort };
}

export async function getMarketplaceCategories(): Promise<MpCategory[]> {
  const rows = await withPublic((tx) =>
    tx<{ slug: string; name_bn: string; name_en: string }[]>`
      select slug, name_bn, name_en from marketplace_category
       where is_active = true order by sort_order asc
    `,
  );
  return rows.map((r) => ({ slug: r.slug, nameBn: r.name_bn, nameEn: r.name_en }));
}

export interface MpVariant {
  id: string;
  title: string | null;
  price: number;
  inStock: boolean;
  /** Wholesale fields (null for retail-only variants) */
  wholesalePrice: number | null;
  tierPrices: Array<{ min_qty: number; unit_price: number }>;
  moq: number | null;
}

export interface MpProductDetail extends MpListing {
  description: string | null;
  variants: MpVariant[];
}

// PDP: one listing (by vendor + product slug) plus its variant projection.
export async function getMarketplaceProduct(
  vendorSlug: string,
  productSlug: string,
): Promise<MpProductDetail | null> {
  return withPublic(async (tx) => {
    const rows = await tx<(ListingRow & { id: string; description: string | null })[]>`
      select id, product_id, tenant_id, vendor_slug, slug, title, vendor_name,
             price_from, image_url, in_stock, rating_avg, rating_count,
             is_wholesale, wholesale_only, moq, description
        from marketplace_listing
       where vendor_slug = ${vendorSlug} and slug = ${productSlug}
         and status = 'active' and hidden = false
       limit 1
    `;
    const row = rows[0];
    if (!row) return null;

    const variants = await tx<{ id: string; title: string | null; price: string; in_stock: boolean; wholesale_price: string | null; tier_prices: string; moq: number | null }[]>`
      select id, title, price, in_stock, wholesale_price, tier_prices, moq from marketplace_listing_variant
       where listing_id = ${row.id} order by position asc
    `;
    return {
      ...toListing(row),
      description: row.description,
      variants: variants.map((v) => ({
        id: v.id,
        title: v.title,
        price: Number(v.price),
        inStock: v.in_stock,
        wholesalePrice: v.wholesale_price ? Number(v.wholesale_price) : null,
        tierPrices: typeof v.tier_prices === "string" ? JSON.parse(v.tier_prices) : (v.tier_prices as Array<{ min_qty: number; unit_price: number }>) ?? [],
        moq: v.moq,
      })),
    };
  });
}

export interface MpOrderSummary {
  id: string;
  status: string;
  grandTotal: number;
  createdAt: string;
  suborders: {
    vendorName: string;
    orderNumber: number | null;
    status: string;
    grandTotal: number;
    codAmount: number;
  }[];
}

// Buyer order history — platform-level marketplace tables only (never crosses
// into tenant `orders`). Runs under withBuyer so RLS scopes to this buyer.
export async function getBuyerOrders(buyerId: string): Promise<MpOrderSummary[]> {
  return withBuyer(buyerId, async (tx) => {
    const orders = await tx<
      { id: string; status: string; grand_total: string; created_at: string }[]
    >`
      select id, status, grand_total, created_at from marketplace_order
       where buyer_id = ${buyerId} order by created_at desc limit 50
    `;
    if (orders.length === 0) return [];

    const subs = await tx<
      {
        marketplace_order_id: string;
        vendor_name: string;
        order_number: string | null;
        status: string;
        grand_total: string;
        cod_amount: string;
      }[]
    >`
      select marketplace_order_id, vendor_name, order_number, status, grand_total, cod_amount
        from marketplace_suborder
       where marketplace_order_id in ${tx(orders.map((o) => o.id))}
    `;

    return orders.map((o) => ({
      id: o.id,
      status: o.status,
      grandTotal: Number(o.grand_total),
      createdAt: o.created_at,
      suborders: subs
        .filter((s) => s.marketplace_order_id === o.id)
        .map((s) => ({
          vendorName: s.vendor_name,
          orderNumber: s.order_number ? Number(s.order_number) : null,
          status: s.status,
          grandTotal: Number(s.grand_total),
          codAmount: Number(s.cod_amount),
        })),
    }));
  });
}
