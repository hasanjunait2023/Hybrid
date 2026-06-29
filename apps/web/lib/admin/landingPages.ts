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

export interface FunnelConfig {
  thank_you_url?: string;
  upsells?: Array<{ label: string; bump_price: number }>;
  post_checkout_upsell?: PostCheckoutUpsell;
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
  const blocks = JSON.stringify(input.blocks ?? []);
  const funnelConfig = JSON.stringify(input.funnelConfig ?? {});
  await withTenant(tenantId, userId, (tx) =>
    tx`
      update landing_page set
        slug = coalesce(${input.slug ?? null}, slug),
        title = coalesce(${input.title ?? null}, title),
        blocks = ${blocks}::jsonb,
        funnel_config = ${funnelConfig}::jsonb,
        updated_at = now()
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
