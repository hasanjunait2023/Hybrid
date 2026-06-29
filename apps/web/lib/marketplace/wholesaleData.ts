import "server-only";

// Wholesale read layer (Phase 3). Extends the marketplace data layer with
// B2B-specific queries. All reads go through withPublic (anonymous catalog) or
// withBuyer (verified B2B pricing). No raw sql.
import { withPublic } from "@hybrid/db";
import type { MpListing, MpProductDetail, MpVariant } from "./data";

// ── Internal row types ──────────────────────────────────────────────────────

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
  moq: number | null;
  wholesale_only: boolean;
}

function toListing(r: ListingRow): WholesaleListing {
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
    isWholesale: true,
    wholesaleOnly: r.wholesale_only,
    moq: r.moq,
  };
}

const LIMIT = 60;

// ── Public wholesale browse ──────────────────────────────────────────────────

export interface WholesaleListing extends MpListing {
  moq: number | null;
  wholesaleOnly: boolean;
}

/**
 * Browse / search / category-filter wholesale products.
 * Always filters on is_wholesale = true. Respects wholesale_only flag.
 * Anonymous callers see only public fields (no wholesale_price).
 */
export async function listWholesaleProducts(opts: {
  q?: string;
  categorySlug?: string;
  sortBy?: "price" | "rating" | "newest";
} = {}): Promise<WholesaleListing[]> {
  const q = opts.q?.trim();
  const cat = opts.categorySlug?.trim();
  const sortBy = opts.sortBy ?? "rating";

  const orderClause =
    sortBy === "price"
      ? "order by price_from asc, rating_avg desc"
      : sortBy === "newest"
        ? "order by synced_at desc, rating_avg desc"
        : "order by rating_avg desc, synced_at desc";

  const rows = await withPublic((tx) => {
    if (q) {
      return tx<(ListingRow & { moq: number | null; wholesale_only: boolean })[]>`
        select product_id, tenant_id, vendor_slug, slug, title, vendor_name,
               price_from, image_url, in_stock, rating_avg, rating_count,
               moq, wholesale_only
          from marketplace_listing
         where status = 'active' and hidden = false
           and is_wholesale = true
           and search_tsv @@ plainto_tsquery('simple', ${q})
         ${tx(orderClause)}
         limit ${LIMIT}
      `;
    }
    if (cat) {
      return tx<(ListingRow & { moq: number | null; wholesale_only: boolean })[]>`
        select ml.product_id, ml.tenant_id, ml.vendor_slug, ml.slug, ml.title, ml.vendor_name,
               ml.price_from, ml.image_url, ml.in_stock, ml.rating_avg, ml.rating_count,
               ml.moq, ml.wholesale_only
          from marketplace_listing ml
          join marketplace_category c on c.id = ml.category_id
         where ml.status = 'active' and ml.hidden = false
           and ml.is_wholesale = true
           and c.slug = ${cat}
         ${tx(orderClause)}
         limit ${LIMIT}
      `;
    }
    return tx<(ListingRow & { moq: number | null; wholesale_only: boolean })[]>`
      select product_id, tenant_id, vendor_slug, slug, title, vendor_name,
             price_from, image_url, in_stock, rating_avg, rating_count,
             moq, wholesale_only
        from marketplace_listing
       where status = 'active' and hidden = false
         and is_wholesale = true
       ${tx(orderClause)}
       limit ${LIMIT}
    `;
  });
  return rows.map(toListing);
}

// ── Wholesale PDP ───────────────────────────────────────────────────────────

export interface WholesaleVariant extends MpVariant {
  wholesalePrice: number | null;
  tierPrices: Array<{ min_qty: number; unit_price: number }>;
  moq: number | null;
}

export interface WholesaleProductDetail extends MpProductDetail {
  moq: number | null;
  wholesaleOnly: boolean;
  wholesaleVariants: WholesaleVariant[];
}

/**
 * Get a single wholesale product by vendor + product slug.
 * Returns null if not found or not a wholesale listing.
 * Anonymous callers get public fields only (wholesalePrice = null).
 */
export async function getWholesaleProduct(
  vendorSlug: string,
  productSlug: string,
): Promise<WholesaleProductDetail | null> {
  return withPublic(async (tx) => {
    const rows = await tx<(ListingRow & { id: string; description: string | null; moq: number | null; wholesale_only: boolean })[]>`
      select id, product_id, tenant_id, vendor_slug, slug, title, vendor_name,
             price_from, image_url, in_stock, rating_avg, rating_count, description,
             moq, wholesale_only
        from marketplace_listing
       where vendor_slug = ${vendorSlug} and slug = ${productSlug}
         and status = 'active' and hidden = false
         and is_wholesale = true
       limit 1
    `;
    const row = rows[0];
    if (!row) return null;

    const variantRows = await tx<{
      id: string;
      title: string | null;
      price: string;
      in_stock: boolean;
      wholesale_price: string | null;
      tier_prices: unknown;
      moq: number | null;
    }[]>`
      select id, title, price, in_stock, wholesale_price, tier_prices, moq
        from marketplace_listing_variant
       where listing_id = ${row.id} order by position asc
    `;

    const wholesaleVariants: WholesaleVariant[] = variantRows.map((v) => ({
      id: v.id,
      title: v.title,
      price: Number(v.price),
      inStock: v.in_stock,
      wholesalePrice: v.wholesale_price ? Number(v.wholesale_price) : null,
      tierPrices: parseTierPrices(v.tier_prices),
      moq: v.moq,
    }));

    return {
      productId: row.product_id,
      tenantId: row.tenant_id,
      vendorSlug: row.vendor_slug,
      productSlug: row.slug,
      title: row.title,
      vendorName: row.vendor_name,
      priceFrom: Number(row.price_from),
      imageUrl: row.image_url,
      inStock: row.in_stock,
      ratingAvg: Number(row.rating_avg),
      ratingCount: row.rating_count,
      isWholesale: true,
      wholesaleOnly: row.wholesale_only,
      moq: row.moq,
      description: row.description,
      variants: variantRows.map((v) => ({
        id: v.id,
        title: v.title,
        price: Number(v.price),
        inStock: v.in_stock,
        wholesalePrice: v.wholesale_price ? Number(v.wholesale_price) : null,
        tierPrices: parseTierPrices(v.tier_prices),
        moq: v.moq,
      })),
      wholesaleVariants,
    };
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseTierPrices(raw: unknown): Array<{ min_qty: number; unit_price: number }> {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .filter((t: unknown): t is { min_qty?: number; unit_price?: number } =>
      typeof t === "object" && t !== null,
    )
    .map((t) => ({
      min_qty: t.min_qty ?? 0,
      unit_price: t.unit_price ?? 0,
    }))
    .sort((a, b) => a.min_qty - b.min_qty);
}
