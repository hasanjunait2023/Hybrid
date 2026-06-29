// ============================================================================
// Marketplace retail-section filtering. Proves the consumer /market browse
// (listMarketplaceProducts) hides wholesale_only products — they belong to the
// /market/wholesale section only. Isolated by a unique search token so other
// seeded listings don't interfere.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";

process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";

import { provisionTenant, createAppUser } from "../../../apps/web/lib/auth/provision";
import { syncMarketplaceListingsForTenant } from "@/lib/marketplace/sync";
import { listMarketplaceProducts } from "@/lib/marketplace/data";

const RUN = Date.now().toString(36);
const SLUG = `mp-filter-${RUN}`;
const EMAIL = `mp-filter-${RUN}@store.test`;
const TOKEN = `zqxfilter${RUN}`; // unique title token to isolate the search

let tenantId = "";
let userId = "";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from tenant where slug = ${SLUG}`;
    await tx`delete from app_user where email = ${EMAIL}`;
  });
}

describe("Marketplace retail filtering", () => {
  beforeAll(async () => {
    await cleanup();
    userId = (await createAppUser({ email: EMAIL, fullName: "Filter Vendor" })).userId;
    tenantId = (await provisionTenant({ userId, storeName: "Filter Vendor", slug: SLUG, businessType: "wholesale" })).tenantId;

    await asPlatformAdmin(async (tx) => {
      // A normal retail product and a wholesale-only product, both searchable by TOKEN.
      const retail = await tx<{ id: string }[]>`
        insert into product (tenant_id, title, slug, status, is_wholesale, wholesale_only)
        values (${tenantId}, ${`${TOKEN} retail`}, ${`${TOKEN}-retail`}, 'active', false, false) returning id`;
      const wholesaleOnly = await tx<{ id: string }[]>`
        insert into product (tenant_id, title, slug, status, is_wholesale, wholesale_only)
        values (${tenantId}, ${`${TOKEN} bulk`}, ${`${TOKEN}-bulk`}, 'active', true, true) returning id`;
      for (const p of [retail[0]!.id, wholesaleOnly[0]!.id]) {
        await tx`insert into product_variant (tenant_id, product_id, price, track_inventory) values (${tenantId}, ${p}, 100, false)`;
      }
    });

    // Project both into the world-readable marketplace_listing table.
    await syncMarketplaceListingsForTenant(tenantId);
  });

  afterAll(cleanup);

  it("1. the retail browse shows the retail product but hides the wholesale_only one", async () => {
    const results = await listMarketplaceProducts({ q: TOKEN });
    const slugs = results.map((r) => r.productSlug);
    expect(slugs).toContain(`${TOKEN}-retail`);
    expect(slugs).not.toContain(`${TOKEN}-bulk`);
  });
});
