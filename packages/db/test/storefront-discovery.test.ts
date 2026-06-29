// ============================================================================
// Storefront discovery suite — search, collection detail, related products.
// Isolated on a freshly provisioned tenant with 3 products and one collection
// (two products linked) so it never races other suites.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";

process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";

import { provisionTenant, createAppUser } from "../../../apps/web/lib/auth/provision";
import {
  searchStorefrontProducts,
  getStorefrontCollectionBySlug,
  getStorefrontProductsByCollection,
  getRelatedProducts,
} from "../../../apps/web/lib/storefront/data";

const RUN = Date.now().toString(36);
const SLUG = `disco-${RUN}`;
const EMAIL = `disco-owner-${RUN}@store.test`;

let tenantId = "";
let userId = "";
const products: Record<string, string> = {}; // title → id
let collectionId = "";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from tenant where slug = ${SLUG}`;
    await tx`delete from app_user where email = ${EMAIL}`;
  });
}

describe("Storefront discovery", () => {
  beforeAll(async () => {
    await cleanup();
    const owner = await createAppUser({ email: EMAIL, fullName: "Disco Owner" });
    userId = owner.userId;
    tenantId = (await provisionTenant({ userId, storeName: "Disco Store", slug: SLUG })).tenantId;

    const seed: ReadonlyArray<readonly [string, string]> = [
      ["Red Cotton Shirt", "red-cotton-shirt"],
      ["Blue Cotton Shirt", "blue-cotton-shirt"],
      ["Leather Boots", "leather-boots"],
    ];
    await asPlatformAdmin(async (tx) => {
      for (const [title, slug] of seed) {
        const rows = await tx<{ id: string }[]>`
          insert into product (tenant_id, title, slug, status, description)
          values (${tenantId}, ${title}, ${slug}, 'active', 'x')
          returning id
        `;
        products[title] = rows[0]!.id;
      }
      const col = await tx<{ id: string }[]>`
        insert into collection (tenant_id, title, slug, description, is_active)
        values (${tenantId}, 'Shirts', 'shirts', 'All shirts', true)
        returning id
      `;
      collectionId = col[0]!.id;
      // Link the two shirts to the collection (not the boots).
      for (const t of ["Red Cotton Shirt", "Blue Cotton Shirt"] as const) {
        await tx`
          insert into product_collection (tenant_id, product_id, collection_id)
          values (${tenantId}, ${products[t]!}, ${collectionId})
        `;
      }
    });
  });

  afterAll(cleanup);

  it("1. search matches by title (case-insensitive, partial)", async () => {
    const cotton = await searchStorefrontProducts(tenantId, "cotton");
    expect(cotton.map((p) => p.slug).sort()).toEqual(["blue-cotton-shirt", "red-cotton-shirt"]);

    const boots = await searchStorefrontProducts(tenantId, "BOOT");
    expect(boots).toHaveLength(1);
    expect(boots[0]?.slug).toBe("leather-boots");

    expect(await searchStorefrontProducts(tenantId, "")).toHaveLength(0);
    expect(await searchStorefrontProducts(tenantId, "nonexistent")).toHaveLength(0);
  });

  it("2. collection detail returns the collection + only its products", async () => {
    const col = await getStorefrontCollectionBySlug(tenantId, "shirts");
    expect(col?.title).toBe("Shirts");
    expect(col?.description).toBe("All shirts");

    const inCollection = await getStorefrontProductsByCollection(tenantId, collectionId);
    expect(inCollection.map((p) => p.slug).sort()).toEqual(["blue-cotton-shirt", "red-cotton-shirt"]);

    expect(await getStorefrontCollectionBySlug(tenantId, "nope")).toBeNull();
  });

  it("3. related products share a collection, excluding the product itself", async () => {
    const related = await getRelatedProducts(tenantId, products["Red Cotton Shirt"]!);
    // Blue shirt shares the Shirts collection; Red itself is excluded.
    expect(related.some((p) => p.slug === "blue-cotton-shirt")).toBe(true);
    expect(related.some((p) => p.slug === "red-cotton-shirt")).toBe(false);
  });

  it("4. related falls back to recent products when there is no collection overlap", async () => {
    // Boots are in no collection → fallback to recent active (excluding boots).
    const related = await getRelatedProducts(tenantId, products["Leather Boots"]!, 4);
    expect(related.length).toBeGreaterThan(0);
    expect(related.some((p) => p.slug === "leather-boots")).toBe(false);
  });
});
