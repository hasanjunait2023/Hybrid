// Catalog data layer (blueprint S-CATALOG 1.2). All reads go through withTenant
// (RLS). The admin Server Actions in app/(admin)/admin/products/**/actions.ts
// mutate and revalidate the tenant:{id}:products / :product:{id} / :collections
// cache tags.
//
// Numerals are Latin in admin (DESIGN §4.4); formatting happens at the view
// layer. This module returns plain numbers.
import { withTenant } from "@hybrid/db";
import { LOW_STOCK_THRESHOLD } from "./dashboard";

export interface ProductListFilter {
  /** product_status, or "all". */
  status?: "all" | "draft" | "active" | "archived";
  /** trigram / ILIKE search over title (uses product_title_trgm_idx). */
  query?: string;
}

export interface AdminProductListRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  price: number;
  inventory: number;
  imageUrl: string | null;
  variantCount: number;
}

// Product list with status filter + title search (DESIGN §P4 list).
export async function listProducts(
  tenantId: string,
  userId: string,
  filter: ProductListFilter = {},
): Promise<AdminProductListRow[]> {
  const status = filter.status && filter.status !== "all" ? filter.status : null;
  const query = filter.query?.trim() ? `%${filter.query.trim()}%` : null;

  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      {
        id: string;
        title: string;
        slug: string;
        status: string;
        price: string | null;
        // sum(...) over an int column returns bigint → postgres.js yields a string.
        inventory: string | null;
        image_url: string | null;
        variant_count: number;
      }[]
    >`
      select
        p.id, p.title, p.slug, p.status,
        (select min(v.price) from product_variant v where v.product_id = p.id) as price,
        (select coalesce(sum(v.inventory_quantity), 0)::int from product_variant v where v.product_id = p.id) as inventory,
        (select i.url from product_image i where i.product_id = p.id order by i.position asc limit 1) as image_url,
        (select count(*)::int from product_variant v where v.product_id = p.id) as variant_count
      from product p
      where (${status}::product_status is null or p.status = ${status}::product_status)
        and (${query}::text is null or p.title ilike ${query})
      order by p.created_at desc
    `,
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    status: r.status,
    price: r.price != null ? Number(r.price) : 0,
    inventory: r.inventory != null ? Number(r.inventory) : 0,
    imageUrl: r.image_url,
    variantCount: r.variant_count,
  }));
}

export interface ProductStats {
  total: number;
  active: number;
  lowStock: number;
  outOfStock: number;
}

// ---------------------------------------------------------------------------
// Bulk operations (admin bulk editor). All scoped by tenant_id under withTenant.
// ---------------------------------------------------------------------------

export type BulkProductStatus = "active" | "draft" | "archived";

// Set the status of many products at once. Returns the ids actually changed.
export async function bulkSetProductStatus(
  tenantId: string,
  userId: string,
  productIds: string[],
  status: BulkProductStatus,
): Promise<string[]> {
  if (productIds.length === 0) return [];
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ id: string }[]>`
      update product
         set status = ${status}::product_status, updated_at = now()
       where id in ${tx(productIds)} and tenant_id = ${tenantId}
      returning id
    `,
  );
  return rows.map((r) => r.id);
}

// Adjust the price of every ACTIVE variant of the selected products by a
// percentage (e.g. +10 raises 10%, -15 cuts 15%). Prices never go below 0.
// Returns the distinct product ids touched (so callers can re-sync the
// marketplace projection). The percent is clamped to a sane band by the action.
export async function bulkAdjustVariantPrices(
  tenantId: string,
  userId: string,
  productIds: string[],
  percent: number,
): Promise<string[]> {
  if (productIds.length === 0) return [];
  const factor = Math.max(0, 1 + percent / 100);
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ product_id: string }[]>`
      update product_variant
         set price = round(price * ${factor}, 2), updated_at = now()
       where product_id in ${tx(productIds)} and tenant_id = ${tenantId} and is_active = true
      returning product_id
    `,
  );
  return [...new Set(rows.map((r) => r.product_id))];
}

// Store-wide product counts for the list-page summary strip (independent of the
// active filter). Low/out-of-stock count only active products whose total
// tracked inventory is at/under the threshold (same rule as the dashboard).
export async function getProductStats(
  tenantId: string,
  userId: string,
): Promise<ProductStats> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ total: number; active: number; low_stock: number; out_of_stock: number }[]>`
      with inv as (
        select
          p.id,
          p.status,
          coalesce(sum(v.inventory_quantity) filter (where v.track_inventory = true), 0) as qty,
          bool_or(v.track_inventory) as tracked
        from product p
        left join product_variant v on v.product_id = p.id
        group by p.id, p.status
      )
      select
        count(*)::int as total,
        count(*) filter (where status = 'active')::int as active,
        count(*) filter (where status = 'active' and tracked and qty > 0 and qty <= ${LOW_STOCK_THRESHOLD})::int as low_stock,
        count(*) filter (where status = 'active' and tracked and qty <= 0)::int as out_of_stock
      from inv
    `,
  );
  const r = rows[0];
  return {
    total: r?.total ?? 0,
    active: r?.active ?? 0,
    lowStock: r?.low_stock ?? 0,
    outOfStock: r?.out_of_stock ?? 0,
  };
}

export interface AdminVariant {
  id: string;
  title: string | null;
  sku: string | null;
  price: number;
  inventory: number;
  options: Record<string, string>;
  position: number;
  isActive: boolean;
}

export interface AdminImage {
  id: string;
  url: string;
  alt: string | null;
  position: number;
}

export interface AdminVideo {
  id: string;
  url: string;
  posterUrl: string | null;
  title: string | null;
  durationSeconds: number | null;
  position: number;
}

export interface ProductOption {
  name: string;
  values: string[];
}

export interface AdminProductFull {
  id: string;
  title: string;
  slug: string;
  status: string;
  description: string | null;
  options: ProductOption[];
  variants: AdminVariant[];
  images: AdminImage[];
  /** R1 — product videos, ordered by position asc. */
  videos: AdminVideo[];
  collectionIds: string[];
  marketplaceHidden: boolean;
}

// Full product for the edit form: options, the variant matrix, images, and
// collection membership (DESIGN §P4 product form).
export async function getProductFull(
  tenantId: string,
  userId: string,
  productId: string,
): Promise<AdminProductFull | null> {
  return withTenant(tenantId, userId, async (tx) => {
    const products = await tx<
      {
        id: string;
        title: string;
        slug: string;
        status: string;
        description: string | null;
        options: ProductOption[];
        marketplace_hidden: boolean;
      }[]
    >`
      select id, title, slug, status, description, options, marketplace_hidden
      from product where id = ${productId} limit 1
    `;
    const product = products[0];
    if (!product) return null;

    const variants = await tx<
      {
        id: string;
        title: string | null;
        sku: string | null;
        price: string;
        inventory_quantity: number;
        options: Record<string, string>;
        position: number;
        is_active: boolean;
      }[]
    >`
      select id, title, sku, price, inventory_quantity, options, position, is_active
      from product_variant where product_id = ${productId} order by position asc
    `;

    const images = await tx<
      { id: string; url: string; alt: string | null; position: number }[]
    >`
      select id, url, alt, position from product_image
      where product_id = ${productId} order by position asc
    `;

    const videos = await tx<
      {
        id: string;
        url: string;
        poster_url: string | null;
        title: string | null;
        duration_seconds: number | null;
        position: number;
      }[]
    >`
      select id, url, poster_url, title, duration_seconds, position
      from product_video
      where product_id = ${productId} order by position asc
    `;

    const collections = await tx<{ collection_id: string }[]>`
      select collection_id from product_collection where product_id = ${productId}
    `;

    return {
      id: product.id,
      title: product.title,
      slug: product.slug,
      status: product.status,
      description: product.description,
      marketplaceHidden: product.marketplace_hidden,
      options: Array.isArray(product.options) ? product.options : [],
      variants: variants.map((v) => ({
        id: v.id,
        title: v.title,
        sku: v.sku,
        price: Number(v.price),
        inventory: v.inventory_quantity,
        options: v.options ?? {},
        position: v.position,
        isActive: v.is_active,
      })),
      images: images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, position: i.position })),
      videos: videos.map((v) => ({
        id: v.id,
        url: v.url,
        posterUrl: v.poster_url,
        title: v.title,
        durationSeconds: v.duration_seconds,
        position: v.position,
      })),
      collectionIds: collections.map((c) => c.collection_id),
    };
  });
}

export interface AdminCollectionRow {
  id: string;
  title: string;
  slug: string;
  productCount: number;
  isActive: boolean;
}

export async function listCollections(
  tenantId: string,
  userId: string,
): Promise<AdminCollectionRow[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      { id: string; title: string; slug: string; product_count: number; is_active: boolean }[]
    >`
      select c.id, c.title, c.slug, c.is_active,
        (select count(*)::int from product_collection pc where pc.collection_id = c.id) as product_count
      from collection c order by c.sort_order asc, c.created_at desc
    `,
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    productCount: r.product_count,
    isActive: r.is_active,
  }));
}

export interface CollectionDetail extends AdminCollectionRow {
  description: string | null;
  imageUrl: string | null;
}

export async function getCollection(
  tenantId: string,
  userId: string,
  collectionId: string,
): Promise<{ collection: CollectionDetail; memberIds: string[] } | null> {
  return withTenant(tenantId, userId, async (tx) => {
    const rows = await tx<
      {
        id: string;
        title: string;
        slug: string;
        description: string | null;
        image_url: string | null;
        is_active: boolean;
      }[]
    >`select id, title, slug, description, image_url, is_active from collection where id = ${collectionId} limit 1`;
    const c = rows[0];
    if (!c) return null;
    const members = await tx<{ product_id: string }[]>`
      select product_id from product_collection where collection_id = ${collectionId}
    `;
    return {
      collection: {
        id: c.id,
        title: c.title,
        slug: c.slug,
        description: c.description,
        imageUrl: c.image_url,
        productCount: members.length,
        isActive: c.is_active,
      },
      memberIds: members.map((m) => m.product_id),
    };
  });
}
