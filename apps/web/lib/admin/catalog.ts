// Catalog data layer (blueprint S-CATALOG 1.2). All reads go through withTenant
// (RLS). The admin Server Actions in app/(admin)/admin/products/**/actions.ts
// mutate and revalidate the tenant:{id}:products / :product:{id} / :collections
// cache tags.
//
// Numerals are Latin in admin (DESIGN §4.4); formatting happens at the view
// layer. This module returns plain numbers.
import { withTenant } from "@hybrid/db";

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
  collectionIds: string[];
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
      }[]
    >`
      select id, title, slug, status, description, options
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

    const collections = await tx<{ collection_id: string }[]>`
      select collection_id from product_collection where product_id = ${productId}
    `;

    return {
      id: product.id,
      title: product.title,
      slug: product.slug,
      status: product.status,
      description: product.description,
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
