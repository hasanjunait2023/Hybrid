import "server-only";

// Marketplace read layer (M4). Public catalog reads run under withPublic (the
// anonymous, RLS-on path — world-readable projection only, never asPlatformAdmin).
// Buyer order history runs under withBuyer.
import { withPublic, withBuyer, asPlatformAdmin } from "@hybrid/db";

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
               price_from, image_url, in_stock, rating_avg, rating_count,
               is_wholesale, wholesale_only, moq
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
               ml.price_from, ml.image_url, ml.in_stock, ml.rating_avg, ml.rating_count,
               ml.is_wholesale, ml.wholesale_only, ml.moq
          from marketplace_listing ml
          join marketplace_category c on c.id = ml.category_id
         where ml.status = 'active' and ml.hidden = false and c.slug = ${cat}
         order by ml.rating_avg desc, ml.synced_at desc
         limit ${LIMIT}
      `;
    }
    return tx<ListingRow[]>`
      select product_id, tenant_id, vendor_slug, slug, title, vendor_name,
             price_from, image_url, in_stock, rating_avg, rating_count,
             is_wholesale, wholesale_only, moq
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
  /** Wholesale fields (null for retail-only variants) */
  wholesalePrice: number | null;
  tierPrices: Array<{ min_qty: number; unit_price: number }>;
  moq: number | null;
}

export interface MpProductDetail extends MpListing {
  listingId: string;
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
      listingId: row.id,
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

// ── Vendor profile ───────────────────────────────────────────────────────────

export interface VendorProfile {
  vendorSlug: string;
  vendorName: string;
  ratingAvg: number;
  ratingCount: number;
  productCount: number;
}

export async function getVendorProfile(vendorSlug: string): Promise<VendorProfile | null> {
  const rows = await withPublic((tx) =>
    tx<{ vendor_name: string; rating_avg: string; rating_count: string; product_count: string }[]>`
      select vendor_name,
             round(avg(rating_avg)::numeric, 2) as rating_avg,
             coalesce(sum(rating_count), 0)::text as rating_count,
             count(*)::text as product_count
        from marketplace_listing
       where vendor_slug = ${vendorSlug}
         and status = 'active' and hidden = false
       group by vendor_name
    `,
  );
  const r = rows[0];
  if (!r) return null;
  return {
    vendorSlug,
    vendorName: r.vendor_name,
    ratingAvg: Number(r.rating_avg),
    ratingCount: Number(r.rating_count),
    productCount: Number(r.product_count),
  };
}

export async function getVendorProducts(vendorSlug: string): Promise<MpListing[]> {
  const rows = await withPublic((tx) =>
    tx<ListingRow[]>`
      select product_id, tenant_id, vendor_slug, slug, title, vendor_name,
             price_from, image_url, in_stock, rating_avg, rating_count,
             is_wholesale, wholesale_only, moq
        from marketplace_listing
       where vendor_slug = ${vendorSlug}
         and status = 'active' and hidden = false
       order by rating_avg desc, synced_at desc
       limit 60
    `,
  );
  return rows.map(toListing);
}

// ── Buyer orders ──────────────────────────────────────────────────────────────

export interface MpSuborderSummary {
  orderId: string | null;
  vendorName: string;
  orderNumber: number | null;
  status: string;
  grandTotal: number;
  codAmount: number;
  trackingCode: string | null;
  consignmentId: string | null;
}

export interface MpOrderSummary {
  id: string;
  status: string;
  grandTotal: number;
  createdAt: string;
  suborders: MpSuborderSummary[];
}

// Buyer order history. Runs under withBuyer (RLS buyer-scoped) for order/suborder
// rows, then asPlatformAdmin for the cross-tenant tracking join (shipment table).
export async function getBuyerOrders(buyerId: string): Promise<MpOrderSummary[]> {
  const orders = await withBuyer(buyerId, async (tx) => {
    const rows = await tx<
      { id: string; status: string; grand_total: string; created_at: string }[]
    >`
      select id, status, grand_total, created_at from marketplace_order
       where buyer_id = ${buyerId} order by created_at desc limit 50
    `;
    if (rows.length === 0) return [];

    const subs = await tx<
      {
        marketplace_order_id: string;
        order_id: string | null;
        vendor_name: string;
        order_number: string | null;
        status: string;
        grand_total: string;
        cod_amount: string;
      }[]
    >`
      select marketplace_order_id, order_id, vendor_name, order_number,
             status, grand_total, cod_amount
        from marketplace_suborder
       where marketplace_order_id in ${tx(rows.map((o) => o.id))}
    `;

    return rows.map((o) => ({
      id: o.id,
      status: o.status,
      grandTotal: Number(o.grand_total),
      createdAt: o.created_at,
      suborders: subs
        .filter((s) => s.marketplace_order_id === o.id)
        .map((s): MpSuborderSummary => ({
          orderId: s.order_id,
          vendorName: s.vendor_name,
          orderNumber: s.order_number ? Number(s.order_number) : null,
          status: s.status,
          grandTotal: Number(s.grand_total),
          codAmount: Number(s.cod_amount),
          trackingCode: null,
          consignmentId: null,
        })),
    }));
  });

  if (orders.length === 0) return orders;

  // Cross-tenant tracking join (shipment belongs to tenant RLS).
  const orderIds = orders
    .flatMap((o) => o.suborders.map((s) => s.orderId))
    .filter((id): id is string => id !== null);

  if (orderIds.length > 0) {
    const tracking = await asPlatformAdmin((tx) =>
      tx<{ order_id: string; tracking_code: string | null; consignment_id: string | null }[]>`
        select distinct on (order_id) order_id, tracking_code, consignment_id
          from shipment
         where order_id in ${tx(orderIds)}
         order by order_id, created_at desc
      `,
    );
    const map = new Map(tracking.map((t) => [t.order_id, t]));
    for (const order of orders) {
      for (const sub of order.suborders) {
        if (sub.orderId) {
          const t = map.get(sub.orderId);
          sub.trackingCode = t?.tracking_code ?? null;
          sub.consignmentId = t?.consignment_id ?? null;
        }
      }
    }
  }

  return orders;
}
