// Landing page admin data layer (Phase 3). Funnel builder — create/edit/publish
// tenant landing pages with a JSON block tree. All access via withTenant (RLS).
import { withTenant } from "@hybrid/db";

export type LandingPageStatus = "draft" | "published" | "archived";

export type LpBlock =
  | { type: "hero"; title: string; subtitle: string; cta_text: string; cta_url: string; image_url?: string }
  | { type: "text"; content: string }
  | { type: "image"; url: string; alt: string }
  | { type: "cta"; text: string; url: string };

export interface PostCheckoutUpsell {
  variant_id: string;
  title: string;
  price: number;
  image_url?: string;
  description?: string;
}

export interface AbTestConfig {
  enabled: boolean;
  /** Variant B block tree — variant A uses the main `blocks` field. */
  variant_blocks: LpBlock[];
  /** Traffic split for variant B in percent (default 50). */
  split_pct?: number;
}

export interface FunnelConfig {
  thank_you_url?: string;
  upsells?: Array<{ label: string; bump_price: number }>;
  post_checkout_upsell?: PostCheckoutUpsell;
  ab_test?: AbTestConfig;
}

export interface LandingPageRow {
  id: string;
  slug: string;
  title: string | null;
  status: LandingPageStatus;
  publishedAt: string | null;
  createdAt: string;
}

export interface LandingPageDetail extends LandingPageRow {
  blocks: LpBlock[];
  funnelConfig: FunnelConfig;
}

export async function listLandingPages(
  tenantId: string,
  userId: string,
): Promise<LandingPageRow[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ id: string; slug: string; title: string | null; status: string; published_at: string | null; created_at: string }[]>`
      select id, slug, title, status, published_at, created_at
        from landing_page
       where tenant_id = ${tenantId}
         and status != 'archived'
       order by created_at desc
       limit 100
    `,
  );
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    status: r.status as LandingPageStatus,
    publishedAt: r.published_at,
    createdAt: r.created_at,
  }));
}

export async function getLandingPage(
  tenantId: string,
  userId: string,
  id: string,
): Promise<LandingPageDetail | null> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ id: string; slug: string; title: string | null; status: string; published_at: string | null; created_at: string; blocks: unknown; funnel_config: unknown }[]>`
      select id, slug, title, status, published_at, created_at, blocks, funnel_config
        from landing_page
       where id = ${id} and tenant_id = ${tenantId}
       limit 1
    `,
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    status: r.status as LandingPageStatus,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    blocks: (Array.isArray(r.blocks) ? r.blocks : []) as LpBlock[],
    funnelConfig: (r.funnel_config && typeof r.funnel_config === "object" ? r.funnel_config : {}) as FunnelConfig,
  };
}

export interface CreateLandingPageInput {
  slug: string;
  title: string;
  blocks?: LpBlock[];
  funnelConfig?: FunnelConfig;
}

export async function createLandingPage(
  tenantId: string,
  userId: string,
  input: CreateLandingPageInput,
): Promise<string> {
  const blocks = JSON.stringify(input.blocks ?? []);
  const funnelConfig = JSON.stringify(input.funnelConfig ?? {});
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ id: string }[]>`
      insert into landing_page (id, tenant_id, slug, title, blocks, funnel_config, status)
      values (gen_random_uuid(), ${tenantId}, ${input.slug}, ${input.title},
              ${blocks}::jsonb, ${funnelConfig}::jsonb, 'draft')
      returning id
    `,
  );
  return rows[0]!.id;
}

export interface UpdateLandingPageInput {
  slug?: string;
  title?: string;
  blocks?: LpBlock[];
  funnelConfig?: FunnelConfig;
}

export async function updateLandingPage(
  tenantId: string,
  userId: string,
  id: string,
  input: UpdateLandingPageInput,
): Promise<void> {
  const blocks = input.blocks != null ? JSON.stringify(input.blocks) : null;
  const funnelConfig = input.funnelConfig != null ? JSON.stringify(input.funnelConfig) : null;
  await withTenant(tenantId, userId, (tx) =>
    tx`
      update landing_page set
        slug         = coalesce(${input.slug ?? null}, slug),
        title        = coalesce(${input.title ?? null}, title),
        blocks       = coalesce(${blocks}::jsonb, blocks),
        funnel_config = coalesce(${funnelConfig}::jsonb, funnel_config),
        updated_at   = now()
      where id = ${id} and tenant_id = ${tenantId}
    `,
  );
}

export async function publishLandingPage(
  tenantId: string,
  userId: string,
  id: string,
): Promise<void> {
  await withTenant(tenantId, userId, (tx) =>
    tx`
      update landing_page set
        status = 'published', published_at = now(), updated_at = now()
      where id = ${id} and tenant_id = ${tenantId}
    `,
  );
}

export async function unpublishLandingPage(
  tenantId: string,
  userId: string,
  id: string,
): Promise<void> {
  await withTenant(tenantId, userId, (tx) =>
    tx`
      update landing_page set
        status = 'draft', updated_at = now()
      where id = ${id} and tenant_id = ${tenantId}
    `,
  );
}

export async function archiveLandingPage(
  tenantId: string,
  userId: string,
  id: string,
): Promise<void> {
  await withTenant(tenantId, userId, (tx) =>
    tx`
      update landing_page set
        status = 'archived', updated_at = now()
      where id = ${id} and tenant_id = ${tenantId}
    `,
  );
}

export interface LpAbStats {
  a: { views: number };
  b: { views: number };
  /** Conversion = order.placed events where payload.lp_slug matches this slug. */
  aOrders: number;
  bOrders: number;
  aConvRate: number;
  bConvRate: number;
}

/** Aggregate A/B view + conversion counts from analytics_event for a given LP slug. */
export async function getLpAbStats(
  tenantId: string,
  userId: string,
  lpSlug: string,
): Promise<LpAbStats> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ variant: string; views: number; orders: number }[]>`
      select
        coalesce(ae.payload->>'abVariant', 'a') as variant,
        count(*) filter (where ae.type = 'lp.viewed')::int as views,
        count(*) filter (where ae.type = 'order.placed'
          and ae.payload->>'lp_slug' = ${lpSlug})::int as orders
      from analytics_event ae
      where ae.payload->>'slug' = ${lpSlug}
         or (ae.type = 'order.placed' and ae.payload->>'lp_slug' = ${lpSlug})
      group by variant
    `,
  );
  const get = (v: string, key: "views" | "orders") =>
    rows.find((r) => r.variant === v)?.[key] ?? 0;
  const aViews = get("a", "views");
  const bViews = get("b", "views");
  const aOrders = get("a", "orders");
  const bOrders = get("b", "orders");
  return {
    a: { views: aViews },
    b: { views: bViews },
    aOrders,
    bOrders,
    aConvRate: aViews > 0 ? aOrders / aViews : 0,
    bConvRate: bViews > 0 ? bOrders / bViews : 0,
  };
}

// Public read — for rendering published pages on the storefront.
// userId may be null on the storefront/checkout path (RLS allows selects on published pages).
export async function getPublishedLandingPage(
  tenantId: string,
  userId: string | null,
  slug: string,
): Promise<LandingPageDetail | null> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ id: string; slug: string; title: string | null; status: string; published_at: string | null; created_at: string; blocks: unknown; funnel_config: unknown }[]>`
      select id, slug, title, status, published_at, created_at, blocks, funnel_config
        from landing_page
       where slug = ${slug} and tenant_id = ${tenantId} and status = 'published'
       limit 1
    `,
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    status: "published",
    publishedAt: r.published_at,
    createdAt: r.created_at,
    blocks: (Array.isArray(r.blocks) ? r.blocks : []) as LpBlock[],
    funnelConfig: (r.funnel_config && typeof r.funnel_config === "object" ? r.funnel_config : {}) as FunnelConfig,
  };
}
