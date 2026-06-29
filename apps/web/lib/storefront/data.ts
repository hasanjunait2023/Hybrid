// Storefront data layer (blueprint §8). All reads go through @hybrid/db
// (withTenant / asPlatformAdmin) so RLS context is always set; anonymous
// storefront reads pass userId = null. Results are wrapped in unstable_cache
// with per-tenant cache tags so the admin Server Action can revalidate exactly
// the surfaces it changed.
//
// Cache-tag scheme (blueprint §8):
//   tenant:{id}              tenant:{id}:products
//   tenant:{id}:theme        tenant:{id}:product:{id}
//
// This module is server-only by construction (it uses unstable_cache and the
// postgres-backed @hybrid/db) and is imported only from Server Components and
// Server Actions.
import { unstable_cache } from "next/cache";
import { asPlatformAdmin, withTenant } from "@hybrid/db";
import type { StorefrontProduct, StoreIdentity } from "@hybrid/ui";
import { coerceSettings } from "@/lib/theme/data";
import type { ThemeSettings } from "@/lib/theme/schema";

export interface StorefrontTheme {
  /** Tenant primary/accent (hex) → inline CSS vars on storefront <html>. */
  primary: string;
  accent: string;
}

export interface TenantContext {
  id: string;
  slug: string;
  name: string;
  theme: StorefrontTheme;
  store: StoreIdentity;
  /** Full validated customizer settings (colors/typography/content/sections). */
  settings: ThemeSettings;
}

interface TenantSettings {
  contact?: { phone?: string };
  social?: { facebook?: string };
}

const DEFAULT_THEME: StorefrontTheme = { primary: "#1D4ED8", accent: "#F59E0B" };

// slug -> tenant id. Both lookups run under asPlatformAdmin (same rationale as
// lib/tenant/resolve.ts): we don't have a tenant context yet and these tables
// are RLS-scoped. We resolve the id FIRST (cheap, low-churn) so the heavier
// context cache below can be tagged with the blueprint id-based tags
// (tenant:{id} / tenant:{id}:theme) — letting a store-rename or theme edit bust
// it via the same revalidateTag the admin action already emits. Tagging only by
// slug (the previous bug) left the context cache un-bustable from the admin
// surface, since the admin revalidates id-based tags it never knows the slug for.
async function resolveTenantId(slug: string): Promise<string | null> {
  return unstable_cache(
    async () => {
      const rows = await asPlatformAdmin((tx) =>
        tx<{ id: string }[]>`
          select t.id
          from tenant t
          where t.slug = ${slug}
            and t.status in ('active', 'trial', 'past_due')
          limit 1
        `,
      );
      return rows[0]?.id ?? null;
    },
    [`tenant-id:${slug}`],
    { revalidate: 3600, tags: [`tenant-slug:${slug}`] },
  )();
}

export async function getTenantContextBySlug(
  slug: string,
): Promise<TenantContext | null> {
  const tenantId = await resolveTenantId(slug);
  if (!tenantId) return null;

  return unstable_cache(
    async () => {
      const rows = await asPlatformAdmin((tx) =>
        tx<
          {
            id: string;
            slug: string;
            name: string;
            settings: TenantSettings;
            theme_settings: unknown;
          }[]
        >`
          select
            t.id,
            t.slug,
            t.name,
            t.settings,
            (
              select s.settings
              from tenant_theme_settings s
              where s.tenant_id = t.id and s.is_active = true
              order by s.updated_at desc
              limit 1
            ) as theme_settings
          from tenant t
          where t.id = ${tenantId}
          limit 1
        `,
      );

      const row = rows[0];
      if (!row) return null;

      // Heal the raw JSON (legacy partial rows, missing keys) into the full
      // validated settings so the storefront always renders from a complete,
      // schema-checked object (colors/typography/content/sections).
      const settings = coerceSettings(row.theme_settings);
      const storeName = settings.content.storeName || row.name;
      return {
        id: row.id,
        slug: row.slug,
        name: storeName,
        theme: {
          primary: settings.colors.primary ?? DEFAULT_THEME.primary,
          accent: settings.colors.accent ?? DEFAULT_THEME.accent,
        },
        store: {
          name: storeName,
          phone: row.settings?.contact?.phone ?? null,
          facebookUrl: row.settings?.social?.facebook ?? null,
        },
        settings,
      } satisfies TenantContext;
    },
    [`tenant-ctx:${tenantId}`],
    {
      revalidate: 3600,
      tags: [
        `tenant:${tenantId}`,
        `tenant:${tenantId}:theme`,
        `tenant-slug:${slug}`,
      ],
    },
  )();
}

// Admin-gated DRAFT preview (DESIGN §Q1.4 / brief §2.3). Returns the tenant's
// in-progress draft settings so the customizer's ?preview=1 storefront shows
// unpublished edits. SECURITY: this is NEVER public — the caller MUST have
// already proven an admin session that owns this tenant (the storefront page
// does getSession() + getActiveTenantId and only then calls this). We re-assert
// ownership by reading under withTenant(tenantId, userId) (RLS): a session that
// doesn't own the tenant gets no rows. NOT cached — drafts change as the seller
// edits; preview must always be fresh. Falls back to the published context's
// settings if no draft exists yet.
export async function getDraftTenantContext(
  slug: string,
  tenantId: string,
  userId: string,
): Promise<TenantContext | null> {
  const published = await getTenantContextBySlug(slug);
  if (!published || published.id !== tenantId) return null;

  const draft = await withTenant(tenantId, userId, async (tx) => {
    const rows = await tx<{ settings: unknown }[]>`
      select settings from tenant_theme_settings
       where is_active = false
       order by updated_at desc limit 1
    `;
    return rows[0]?.settings ?? null;
  });
  if (draft == null) return published;

  const settings = coerceSettings(draft);
  const storeName = settings.content.storeName || published.name;
  return {
    ...published,
    name: storeName,
    theme: {
      primary: settings.colors.primary ?? DEFAULT_THEME.primary,
      accent: settings.colors.accent ?? DEFAULT_THEME.accent,
    },
    store: { ...published.store, name: storeName },
    settings,
  } satisfies TenantContext;
}

export interface StorefrontCollection {
  id: string;
  title: string;
  slug: string;
}

// Active collections for the storefront collections_grid section (DESIGN §Q1.3).
// Cached + tagged tenant:{id}:collections so an admin collection edit busts it.
export async function getStorefrontCollections(
  tenantId: string,
): Promise<StorefrontCollection[]> {
  return unstable_cache(
    async () => {
      const rows = await withTenant(tenantId, null, (tx) =>
        tx<{ id: string; title: string; slug: string }[]>`
          select id, title, slug
            from collection
           where is_active = true
           order by sort_order asc, created_at desc
           limit 12
        `,
      );
      return rows.map((r) => ({ id: r.id, title: r.title, slug: r.slug }));
    },
    [`collections:${tenantId}`],
    {
      revalidate: 3600,
      tags: [`tenant:${tenantId}`, `tenant:${tenantId}:collections`],
    },
  )();
}

// Buyer-facing order lookup for the success/track page (DESIGN P1.7). Phone-
// gated: the order is only returned when the supplied phone matches the order's
// customer_phone — there's no buyer account, so the phone IS the access token.
// NOT cached (status changes as couriers sync; always read fresh).
export interface StorefrontOrderItem {
  title: string;
  variantTitle: string | null;
  quantity: number;
  lineTotal: number;
}

export interface StorefrontOrder {
  orderNumber: number;
  fulfillmentStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  codAmount: number;
  grandTotal: number;
  items: StorefrontOrderItem[];
}

// Latin-normalize a phone the same way checkout does (Bangla or Latin digits in).
const BN_TO_LATIN: Record<string, string> = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
};
function normalizePhone(input: string): string {
  return input.replace(/[০-৯]/g, (d) => BN_TO_LATIN[d] ?? d).replace(/[^\d]/g, "");
}

export async function getStorefrontOrder(
  tenantId: string,
  orderNumber: number,
  phone: string,
): Promise<StorefrontOrder | null> {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return null;

  return withTenant(tenantId, null, async (tx) => {
    const orders = await tx<
      {
        id: string;
        order_number: string;
        fulfillment_status: string;
        payment_status: string;
        cod_amount: string;
        grand_total: string;
        customer_phone: string | null;
      }[]
    >`
      select id, order_number, fulfillment_status, payment_status,
             cod_amount, grand_total, customer_phone
        from orders
       where order_number = ${orderNumber}
       limit 1
    `;

    const order = orders[0];
    // Phone gate: compare normalized digits; mismatch → not found (no leak).
    if (!order || normalizePhone(order.customer_phone ?? "") !== normalizedPhone) {
      return null;
    }

    const payment = await tx<{ provider: string }[]>`
      select provider from payment where order_id = ${order.id} order by created_at desc limit 1
    `;
    const items = await tx<
      { title: string; variant_title: string | null; quantity: number; line_total: string }[]
    >`
      select title, variant_title, quantity, line_total
        from order_item where order_id = ${order.id}
    `;

    return {
      orderNumber: Number(order.order_number),
      fulfillmentStatus: order.fulfillment_status,
      paymentStatus: order.payment_status,
      paymentMethod: payment[0]?.provider ?? "cod",
      codAmount: Number(order.cod_amount),
      grandTotal: Number(order.grand_total),
      items: items.map((i) => ({
        title: i.title,
        variantTitle: i.variant_title,
        quantity: i.quantity,
        lineTotal: Number(i.line_total),
      })),
    } satisfies StorefrontOrder;
  });
}

// One active product + its variants for the PDP (blueprint §7, DESIGN P1).
// Variant rows carry price/stock so the client add-to-cart can pick a variant
// and the cart can server-price-check at checkout. Cached + tagged per product
// so an admin edit busts exactly this page via tenant:{id}:product:{id}.
export interface StorefrontVariant {
  id: string;
  title: string | null;
  price: number;
  compareAtPrice: number | null;
  inStock: boolean;
}

export interface StorefrontProductDetail {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  variants: StorefrontVariant[];
  /** Lowest active-variant price — the headline price. */
  price: number;
  compareAtPrice: number | null;
  inStock: boolean;
}

export async function getStorefrontProductBySlug(
  tenantId: string,
  slug: string,
): Promise<StorefrontProductDetail | null> {
  return unstable_cache(
    async () => {
      const product = await withTenant(tenantId, null, async (tx) => {
        const productRows = await tx<
          { id: string; title: string; slug: string; description: string | null }[]
        >`
          select id, title, slug, description
            from product
           where slug = ${slug} and status = 'active'
           limit 1
        `;
        const row = productRows[0];
        if (!row) return null;

        const variants = await tx<
          {
            id: string;
            title: string | null;
            price: string;
            compare_at_price: string | null;
            inventory_quantity: number;
            track_inventory: boolean;
          }[]
        >`
          select id, title, price, compare_at_price, inventory_quantity, track_inventory
            from product_variant
           where product_id = ${row.id} and is_active = true
           order by price asc
        `;

        const image = await tx<{ url: string }[]>`
          select url from product_image
           where product_id = ${row.id}
           order by position asc
           limit 1
        `;

        return { row, variants, imageUrl: image[0]?.url ?? null };
      });

      if (!product) return null;

      const variants: StorefrontVariant[] = product.variants.map((v) => ({
        id: v.id,
        title: v.title,
        price: Number(v.price),
        compareAtPrice: v.compare_at_price != null ? Number(v.compare_at_price) : null,
        inStock: !v.track_inventory || v.inventory_quantity > 0,
      }));

      const lowest = variants.reduce<StorefrontVariant | null>(
        (min, v) => (min == null || v.price < min.price ? v : min),
        null,
      );

      return {
        id: product.row.id,
        title: product.row.title,
        slug: product.row.slug,
        description: product.row.description,
        imageUrl: product.imageUrl,
        variants,
        price: lowest?.price ?? 0,
        compareAtPrice: lowest?.compareAtPrice ?? null,
        inStock: variants.some((v) => v.inStock),
      } satisfies StorefrontProductDetail;
    },
    [`product:${tenantId}:${slug}`],
    {
      revalidate: 3600,
      tags: [`tenant:${tenantId}`, `tenant:${tenantId}:products`],
    },
  )();
}

// A published static page (privacy / returns / terms / about / custom). Content
// is stored as a block tree; static pages use one richtext block whose `value`
// is the plain-text body the storefront renders (whitespace-preserved). Draft
// pages return null (not publicly visible). Cached + busted by tenant:{id}:page:{slug}.
export interface StorefrontPage {
  title: string;
  body: string;
  seoTitle: string | null;
  seoDescription: string | null;
}

interface PageBlock {
  type?: string;
  value?: string;
  content?: string;
  heading?: string;
}

export async function getStorePage(
  tenantId: string,
  slug: string,
): Promise<StorefrontPage | null> {
  return unstable_cache(
    async () => {
      const row = await withTenant(tenantId, null, async (tx) => {
        const rows = await tx<
          { title: string | null; blocks: PageBlock[]; seo: { title?: string; description?: string } }[]
        >`
          select title, blocks, seo
            from store_page
           where slug = ${slug} and status = 'published'
           limit 1
        `;
        return rows[0] ?? null;
      });
      if (!row) return null;

      const blocks = Array.isArray(row.blocks) ? row.blocks : [];
      const body = blocks
        .map((b) => b?.value ?? b?.content ?? b?.heading ?? "")
        .filter((s) => s.trim().length > 0)
        .join("\n\n");

      return {
        title: row.title ?? "",
        body,
        seoTitle: row.seo?.title ?? null,
        seoDescription: row.seo?.description ?? null,
      } satisfies StorefrontPage;
    },
    [`page:${tenantId}:${slug}`],
    {
      revalidate: 3600,
      tags: [`tenant:${tenantId}`, `tenant:${tenantId}:page:${slug}`],
    },
  )();
}

// Approved product reviews + rating for the storefront PDP. Public read
// (userId=null); only 'approved' rows are ever exposed. Cached + busted by
// tenant:{id}:reviews (the admin moderate action revalidates that tag).
export interface StorefrontReview {
  id: string;
  customerName: string | null;
  rating: number;
  body: string | null;
  createdAt: string;
}

export interface StorefrontProductReviews {
  average: number;
  count: number;
  reviews: StorefrontReview[];
}

export async function getStorefrontProductReviews(
  tenantId: string,
  productId: string,
): Promise<StorefrontProductReviews> {
  return unstable_cache(
    async () => {
      return withTenant(tenantId, null, async (tx) => {
        const agg = await tx<{ avg: string | null; n: number }[]>`
          select avg(rating)::numeric(3,2) as avg, count(*)::int as n
            from product_review
           where product_id = ${productId} and status = 'approved'
        `;
        const rows = await tx<
          { id: string; customer_name: string | null; rating: number; body: string | null; created_at: string }[]
        >`
          select id, customer_name, rating, body, created_at
            from product_review
           where product_id = ${productId} and status = 'approved'
           order by created_at desc
           limit 20
        `;
        return {
          average: Number(agg[0]?.avg ?? 0),
          count: agg[0]?.n ?? 0,
          reviews: rows.map((r) => ({
            id: r.id,
            customerName: r.customer_name,
            rating: r.rating,
            body: r.body,
            createdAt: r.created_at,
          })),
        } satisfies StorefrontProductReviews;
      });
    },
    [`reviews:${tenantId}:${productId}`],
    {
      revalidate: 3600,
      tags: [`tenant:${tenantId}`, `tenant:${tenantId}:reviews`],
    },
  )();
}

// Active products for a tenant. min(variant.price) is the card price.
export async function getStorefrontProducts(
  tenantId: string,
): Promise<StorefrontProduct[]> {
  return unstable_cache(
    async () => {
      const rows = await withTenant(tenantId, null, (tx) =>
        tx<
          {
            id: string;
            title: string;
            slug: string;
            price: string | null;
            compare_at_price: string | null;
            inventory_quantity: number | null;
          }[]
        >`
          select
            p.id,
            p.title,
            p.slug,
            (
              select min(v.price)
              from product_variant v
              where v.product_id = p.id and v.is_active = true
            ) as price,
            (
              select v.compare_at_price
              from product_variant v
              where v.product_id = p.id and v.is_active = true
              order by v.price asc
              limit 1
            ) as compare_at_price,
            (
              select coalesce(sum(v.inventory_quantity), 0)
              from product_variant v
              where v.product_id = p.id and v.is_active = true
            ) as inventory_quantity
          from product p
          where p.status = 'active'
          order by p.created_at desc
        `,
      );

      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        price: r.price != null ? Number(r.price) : 0,
        compareAtPrice: r.compare_at_price != null ? Number(r.compare_at_price) : null,
        inStock: (r.inventory_quantity ?? 0) > 0,
        codEnabled: true,
      }));
    },
    [`products:${tenantId}`],
    {
      revalidate: 3600,
      tags: [`tenant:${tenantId}`, `tenant:${tenantId}:products`],
    },
  )();
}
