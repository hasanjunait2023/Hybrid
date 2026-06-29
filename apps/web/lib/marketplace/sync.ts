import "server-only";

// Marketplace listing sync (M1). Projects a tenant's catalog into the
// world-readable marketplace_listing / marketplace_listing_variant tables so the
// public bazaar can browse across vendors WITHOUT ever reading tenant data via
// asPlatformAdmin on the request path.
//
// Contract:
//   * The SOURCE read runs under withTenant(tenantId) — RLS-scoped to the vendor.
//   * The projection WRITE runs under asPlatformAdmin — the legitimate
//     platform-tooling path (it writes a world-readable platform table from
//     cross-tenant source), mirroring resolveTenantByHost and the existing crons.
//   * Listability = product.status === 'active' AND NOT marketplace_hidden.
//     Non-listable products are DELISTED (status='delisted'), not deleted, so
//     rating history survives a relist. A hard product delete cascades the row.
//   * in_stock / price_from are ADVISORY snapshots for browse — checkout always
//     re-prices and re-checks stock authoritatively in placeOrder.
//   * Best-effort: never throws to the caller (the admin mutation must not fail
//     because a projection write hiccuped). The reconcile cron repairs misses.
import { withTenant, asPlatformAdmin } from "@hybrid/db";

interface VariantSource {
  id: string;
  title: string | null;
  options: Record<string, string>;
  price: string;
  inventory_quantity: number;
  track_inventory: boolean;
  position: number;
}

interface ListingSource {
  product: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    status: string;
    marketplace_hidden: boolean;
  };
  vendorSlug: string;
  vendorName: string;
  imageUrl: string | null;
  variants: VariantSource[];
}

// Read everything the projection needs, RLS-scoped to the owning tenant.
async function readSource(tenantId: string, productId: string): Promise<ListingSource | null> {
  return withTenant(tenantId, null, async (tx) => {
    const products = await tx<
      {
        id: string;
        title: string;
        slug: string;
        description: string | null;
        status: string;
        marketplace_hidden: boolean;
      }[]
    >`
      select id, title, slug, description, status, marketplace_hidden
        from product where id = ${productId} and tenant_id = ${tenantId} limit 1
    `;
    const product = products[0];
    if (!product) return null;

    const tenants = await tx<{ slug: string; name: string }[]>`
      select slug, name from tenant where id = ${tenantId} limit 1
    `;
    const tenant = tenants[0];
    if (!tenant) return null;

    const variants = await tx<VariantSource[]>`
      select id, title, options, price, inventory_quantity, track_inventory, position
        from product_variant
       where product_id = ${productId} and is_active = true
       order by position asc, created_at asc
    `;

    const images = await tx<{ url: string }[]>`
      select url from product_image where product_id = ${productId} order by position asc limit 1
    `;

    return {
      product,
      vendorSlug: tenant.slug,
      vendorName: tenant.name,
      imageUrl: images[0]?.url ?? null,
      variants,
    };
  });
}

function priceFrom(variants: VariantSource[]): number {
  if (variants.length === 0) return 0;
  return variants.reduce((min, v) => Math.min(min, Number(v.price)), Number(variants[0]!.price));
}

function anyInStock(variants: VariantSource[]): boolean {
  return variants.some((v) => !v.track_inventory || v.inventory_quantity > 0);
}

// Project ONE product into the marketplace. Idempotent upsert; safe to re-run.
export async function syncMarketplaceListing(tenantId: string, productId: string): Promise<void> {
  try {
    const src = await readSource(tenantId, productId);

    await asPlatformAdmin(async (tx) => {
      // Product gone or not listable → delist (keep the row + rating history).
      const listable =
        src !== null && src.product.status === "active" && !src.product.marketplace_hidden;

      if (!src || !listable) {
        await tx`
          update marketplace_listing
             set status = 'delisted', in_stock = false, synced_at = now()
           where product_id = ${productId}
        `;
        await tx`delete from marketplace_listing_variant where product_id = ${productId}`;
        return;
      }

      const price = priceFrom(src.variants);
      const inStock = anyInStock(src.variants);

      // Upsert the listing. category_id / rating_* are intentionally NOT touched
      // on update — category is a manual platform assignment, ratings are owned
      // by review moderation.
      const rows = await tx<{ id: string }[]>`
        insert into marketplace_listing
          (product_id, tenant_id, vendor_slug, vendor_name, title, slug, description,
           price_from, image_url, in_stock, status, hidden, synced_at)
        values
          (${productId}, ${tenantId}, ${src.vendorSlug}, ${src.vendorName},
           ${src.product.title}, ${src.product.slug}, ${src.product.description},
           ${price}, ${src.imageUrl}, ${inStock}, 'active', false, now())
        on conflict (product_id) do update set
          tenant_id   = excluded.tenant_id,
          vendor_slug = excluded.vendor_slug,
          vendor_name = excluded.vendor_name,
          title       = excluded.title,
          slug        = excluded.slug,
          description = excluded.description,
          price_from  = excluded.price_from,
          image_url   = excluded.image_url,
          in_stock    = excluded.in_stock,
          status      = 'active',
          hidden      = false,
          synced_at   = now()
        returning id
      `;
      const listingId = rows[0]!.id;

      // Refresh the variant projection (delete-then-insert keeps it simple +
      // correct when variants are added/removed/reordered).
      await tx`delete from marketplace_listing_variant where product_id = ${productId}`;
      for (const v of src.variants) {
        await tx`
          insert into marketplace_listing_variant
            (id, listing_id, product_id, tenant_id, title, options, price, in_stock, position)
          values
            (${v.id}, ${listingId}, ${productId}, ${tenantId}, ${v.title},
             ${tx.json(v.options)}, ${Number(v.price)},
             ${!v.track_inventory || v.inventory_quantity > 0}, ${v.position})
        `;
      }
    });
  } catch (error) {
    // Never fail the caller (admin mutation). The reconcile cron is the net.
    console.error(`[marketplace-sync] product ${productId} (tenant ${tenantId}) failed`, error);
  }
}

// Project EVERY product of a tenant (CSV import end + cron backfill). Iterates
// all statuses so archived/hidden products get delisted too.
export async function syncMarketplaceListingsForTenant(tenantId: string): Promise<number> {
  const productIds = await withTenant(tenantId, null, (tx) =>
    tx<{ id: string }[]>`select id from product where tenant_id = ${tenantId}`,
  );
  for (const { id } of productIds) {
    await syncMarketplaceListing(tenantId, id);
  }
  return productIds.length;
}
