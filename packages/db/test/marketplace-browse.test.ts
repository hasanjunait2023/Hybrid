// ============================================================================
// Marketplace browse/search suite — exercises listMarketplaceProducts
// (apps/web/lib/marketplace/data.ts): the unified sort + offset-pagination read
// over the world-readable catalog projection. A unique title token isolates this
// suite's listings from every other suite's rows in the shared embedded Postgres.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import { listMarketplaceProducts } from "@/lib/marketplace/data";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const TOKEN = "zzquniqbrowse"; // unique across the whole DB → isolates this suite

// price → title; deliberately out of insertion order so sorting is meaningful.
const ITEMS = [
  { slug: "mp-brz-alpha", title: `${TOKEN} alpha`, price: 100 },
  { slug: "mp-brz-beta", title: `${TOKEN} beta`, price: 300 },
  { slug: "mp-brz-gamma", title: `${TOKEN} gamma`, price: 200 },
];

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    for (const it of ITEMS) {
      await tx`delete from marketplace_listing where tenant_id = ${TENANT_A} and slug = ${it.slug}`;
      await tx`delete from product where tenant_id = ${TENANT_A} and slug = ${it.slug}`;
    }
  });
}

describe("Marketplace browse / sort / pagination", () => {
  beforeAll(async () => {
    await cleanup();
    await asPlatformAdmin(async (tx) => {
      for (const it of ITEMS) {
        const rows = await tx<{ id: string }[]>`
          insert into product (tenant_id, title, slug, status)
          values (${TENANT_A}, ${it.title}, ${it.slug}, 'active')
          returning id
        `;
        await tx`
          insert into marketplace_listing
            (product_id, tenant_id, vendor_slug, vendor_name, title, slug, price_from, category_id)
          values
            (${rows[0]!.id}, ${TENANT_A}, 'store-a', 'Store A', ${it.title}, ${it.slug}, ${it.price},
             (select id from marketplace_category where slug = 'electronics'))
        `;
      }
    });
  });

  afterAll(cleanup);

  it("1. full-text search matches all three tokened listings", async () => {
    const { items } = await listMarketplaceProducts({ q: TOKEN });
    expect(items.length).toBe(3);
    expect(items.every((i) => i.title.startsWith(TOKEN))).toBe(true);
  });

  it("2. price_asc / price_desc sort the results", async () => {
    const asc = await listMarketplaceProducts({ q: TOKEN, sort: "price_asc" });
    expect(asc.items.map((i) => i.priceFrom)).toEqual([100, 200, 300]);

    const desc = await listMarketplaceProducts({ q: TOKEN, sort: "price_desc" });
    expect(desc.items.map((i) => i.priceFrom)).toEqual([300, 200, 100]);
  });

  it("3. pagination: pageSize 2 yields hasMore then a final short page", async () => {
    const p1 = await listMarketplaceProducts({ q: TOKEN, sort: "price_asc", page: 1, pageSize: 2 });
    expect(p1.items.map((i) => i.priceFrom)).toEqual([100, 200]);
    expect(p1.hasMore).toBe(true);

    const p2 = await listMarketplaceProducts({ q: TOKEN, sort: "price_asc", page: 2, pageSize: 2 });
    expect(p2.items.map((i) => i.priceFrom)).toEqual([300]);
    expect(p2.hasMore).toBe(false);
  });

  it("4. category filter returns the tokened listings under that category", async () => {
    const { items } = await listMarketplaceProducts({ categorySlug: "electronics" });
    const mine = items.filter((i) => i.title.startsWith(TOKEN));
    expect(mine.length).toBe(3);
  });
});
