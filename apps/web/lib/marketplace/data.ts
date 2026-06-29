import "server-only";

// Marketplace read layer (M4). Public catalog reads run under withPublic (the
// anonymous, RLS-on path — world-readable projection only, never asPlatformAdmin).
// Buyer order history runs under withBuyer.
import { withPublic, withBuyer } from "@hybrid/db";

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
  };
}

const LIMIT = 60;

// Browse / search / category in one query. q → full-text; categorySlug → filter.
export async function listMarketplaceProducts(opts: {
  q?: string;
  categorySlug?: string;
} = {}): Promise<MpListing[]> {
  const q = opts.q?.trim();
  const cat = opts.categorySlug?.trim();

  const rows = await withPublic((tx) => {
    if (q) {
      return tx<ListingRow[]>`
        select product_id, tenant_id, vendor_slug, slug, title, vendor_name,
               price_from, image_url, in_stock, rating_avg, rating_count
          from marketplace_listing
         where status = 'active' and hidden = false
           and search_tsv @@ plainto_tsquery('simple', ${q})
         order by ts_rank(search_tsv, plainto_tsquery('simple', ${q})) desc, rating_avg desc
         limit ${LIMIT}
      `;
    }
    if (cat) {
      return tx<ListingRow[]>`
        select ml.product_id, ml.tenant_id, ml.vendor_slug, ml.slug, ml.title, ml.vendor_name,
               ml.price_from, ml.image_url, ml.in_stock, ml.rating_avg, ml.rating_count
          from marketplace_listing ml
          join marketplace_category c on c.id = ml.category_id
         where ml.status = 'active' and ml.hidden = false and c.slug = ${cat}
         order by ml.rating_avg desc, ml.synced_at desc
         limit ${LIMIT}
      `;
    }
    return tx<ListingRow[]>`
      select product_id, tenant_id, vendor_slug, slug, title, vendor_name,
             price_from, image_url, in_stock, rating_avg, rating_count
        from marketplace_listing
       where status = 'active' and hidden = false
       order by rating_avg desc, synced_at desc
       limit ${LIMIT}
    `;
  });
  return rows.map(toListing);
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
             price_from, image_url, in_stock, rating_avg, rating_count, description
        from marketplace_listing
       where vendor_slug = ${vendorSlug} and slug = ${productSlug}
         and status = 'active' and hidden = false
       limit 1
    `;
    const row = rows[0];
    if (!row) return null;

    const variants = await tx<{ id: string; title: string | null; price: string; in_stock: boolean }[]>`
      select id, title, price, in_stock from marketplace_listing_variant
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
