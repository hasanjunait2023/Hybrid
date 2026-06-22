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
}

interface ThemeSettings {
  colors?: { primary?: string; accent?: string };
  storeName?: string;
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
          where t.slug = ${slug} and t.status = 'active'
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
            theme_settings: ThemeSettings | null;
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

      const themeColors = row.theme_settings?.colors ?? {};
      return {
        id: row.id,
        slug: row.slug,
        name: row.theme_settings?.storeName ?? row.name,
        theme: {
          primary: themeColors.primary ?? DEFAULT_THEME.primary,
          accent: themeColors.accent ?? DEFAULT_THEME.accent,
        },
        store: {
          name: row.theme_settings?.storeName ?? row.name,
          phone: row.settings?.contact?.phone ?? null,
          facebookUrl: row.settings?.social?.facebook ?? null,
        },
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
