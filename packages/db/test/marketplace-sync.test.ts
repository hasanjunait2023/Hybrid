// ============================================================================
// Marketplace listing-sync suite (M1). Exercises the real sync writer
// (apps/web/lib/marketplace/sync.ts) against the embedded Postgres: a tenant's
// catalog change projects into the world-readable marketplace_listing tables.
//
// Owns a DEDICATED product (created in beforeAll, removed in afterAll) instead
// of borrowing a shared seed row. The suite runs against one ephemeral Postgres
// shared by every db test file (fileParallelism:false); borrowing a seed
// product let an earlier suite's broad delete remove it out from under us,
// failing this suite non-deterministically. Created+deleted within this suite =
// zero net product-count drift for count-asserting suites (e.g. rls.test).
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import {
  syncMarketplaceListing,
  syncMarketplaceListingsForTenant,
} from "@/lib/marketplace/sync";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
// Suite-owned product under TENANT_A (vendor slug "store-a"). Dedicated id/slug
// so no other suite touches it.
const PROD = "d0000003-0000-0000-0000-00000000d003";
const PROD_SLUG = "mp-sync-probe";
const ORIG_PRICE = 1299;

let varId = "";

async function dropOwnRows(tx: import("../src/index").Tx): Promise<void> {
  await tx`delete from marketplace_listing_variant where product_id = ${PROD}`;
  await tx`delete from marketplace_listing where product_id = ${PROD}`;
  await tx`delete from product_variant where product_id = ${PROD}`;
  await tx`delete from product where id = ${PROD}`;
}

async function listing(): Promise<
  { status: string; price_from: string; in_stock: boolean; vendor_slug: string } | null
> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ status: string; price_from: string; in_stock: boolean; vendor_slug: string }[]>`
      select status, price_from, in_stock, vendor_slug
        from marketplace_listing where product_id = ${PROD}
    `,
  );
  return rows[0] ?? null;
}

async function variantCount(): Promise<number> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ n: number }[]>`
      select count(*)::int as n from marketplace_listing_variant where product_id = ${PROD}
    `,
  );
  return rows[0]?.n ?? 0;
}

describe("Marketplace listing sync", () => {
  beforeAll(async () => {
    await asPlatformAdmin(async (tx) => {
      await dropOwnRows(tx); // idempotent for local re-runs
      await tx`
        insert into product (id, tenant_id, title, slug, status, description)
        values (${PROD}, ${TENANT_A}, 'MP Sync Probe', ${PROD_SLUG}, 'active', 'sync test')
      `;
      const rows = await tx<{ id: string }[]>`
        insert into product_variant (tenant_id, product_id, title, price, position, inventory_quantity)
        values (${TENANT_A}, ${PROD}, 'Default', ${ORIG_PRICE}, 0, 60)
        returning id
      `;
      varId = rows[0]!.id;
    });
  });

  afterAll(async () => {
    await asPlatformAdmin(dropOwnRows);
  });

  it("1. syncing an active product creates a listing", async () => {
    await syncMarketplaceListing(TENANT_A, PROD);
    const l = await listing();
    expect(l).not.toBeNull();
    expect(l?.status).toBe("active");
    expect(Number(l?.price_from)).toBe(ORIG_PRICE);
    expect(l?.in_stock).toBe(true);
    expect(l?.vendor_slug).toBe("store-a"); // vendor snapshot from tenant
    expect(await variantCount()).toBe(1);
  });

  it("2. a price change re-syncs price_from", async () => {
    await asPlatformAdmin((tx) => tx`update product_variant set price = 750 where id = ${varId}`);
    await syncMarketplaceListing(TENANT_A, PROD);
    const l = await listing();
    expect(Number(l?.price_from)).toBe(750);
  });

  it("3. archiving a product delists it and drops its variant projection", async () => {
    await asPlatformAdmin((tx) => tx`update product set status = 'archived' where id = ${PROD}`);
    await syncMarketplaceListing(TENANT_A, PROD);
    const l = await listing();
    expect(l?.status).toBe("delisted");
    expect(l?.in_stock).toBe(false);
    expect(await variantCount()).toBe(0);
  });

  it("4. the bulk backfill repairs a manually-desynced listing", async () => {
    await asPlatformAdmin(async (tx) => {
      await tx`update product set status = 'active' where id = ${PROD}`;
      await tx`update marketplace_listing set price_from = 1, status = 'active' where product_id = ${PROD}`;
    });
    await syncMarketplaceListingsForTenant(TENANT_A);
    const l = await listing();
    expect(l?.status).toBe("active");
    expect(Number(l?.price_from)).toBe(750); // healed back to the real min price
    expect(await variantCount()).toBe(1);
  });
});
