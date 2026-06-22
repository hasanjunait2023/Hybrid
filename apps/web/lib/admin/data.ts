// Admin data layer. The dev session carries only userId (blueprint §5); the
// active tenant is the user's membership. We resolve it under asPlatformAdmin
// (tenant_member is RLS-scoped and we don't yet have a tenant context), then all
// tenant-scoped reads/writes run through withTenant(tenantId, userId, ...).
import { asPlatformAdmin, withTenant } from "@hybrid/db";

export interface AdminProductRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  price: number;
  inventory: number;
}

export interface AdminProductDetail {
  id: string;
  title: string;
  slug: string;
  status: string;
  description: string | null;
  variantId: string;
  price: number;
  inventory: number;
}

/** First tenant the user belongs to (P0: owners have exactly one). */
export async function getActiveTenantId(userId: string): Promise<string | null> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ tenant_id: string }[]>`
      select tenant_id
      from tenant_member
      where user_id = ${userId} and accepted_at is not null
      order by created_at asc
      limit 1
    `,
  );
  return rows[0]?.tenant_id ?? null;
}

export async function getAdminProducts(
  tenantId: string,
  userId: string,
): Promise<AdminProductRow[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      {
        id: string;
        title: string;
        slug: string;
        status: string;
        price: string | null;
        inventory: number | null;
      }[]
    >`
      -- Filter v.is_active = true to match the storefront's price/stock
      -- (lib/storefront/data.ts getStorefrontProducts), so the admin list shows
      -- the same numbers a buyer sees. Inactive variants are excluded here too.
      select
        p.id,
        p.title,
        p.slug,
        p.status,
        (
          select min(v.price) from product_variant v
          where v.product_id = p.id and v.is_active = true
        ) as price,
        (
          select coalesce(sum(v.inventory_quantity), 0)
          from product_variant v
          where v.product_id = p.id and v.is_active = true
        ) as inventory
      from product p
      order by p.created_at desc
    `,
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    status: r.status,
    price: r.price != null ? Number(r.price) : 0,
    inventory: r.inventory ?? 0,
  }));
}

/** Product + its primary (position 0) variant for the edit form. */
export async function getAdminProduct(
  tenantId: string,
  userId: string,
  productId: string,
): Promise<AdminProductDetail | null> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      {
        id: string;
        title: string;
        slug: string;
        status: string;
        description: string | null;
        variant_id: string;
        price: string;
        inventory_quantity: number;
      }[]
    >`
      select
        p.id,
        p.title,
        p.slug,
        p.status,
        p.description,
        v.id   as variant_id,
        v.price,
        v.inventory_quantity
      from product p
      join product_variant v on v.product_id = p.id
      where p.id = ${productId}
      order by v.position asc
      limit 1
    `,
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    description: row.description,
    variantId: row.variant_id,
    price: Number(row.price),
    inventory: row.inventory_quantity,
  };
}
