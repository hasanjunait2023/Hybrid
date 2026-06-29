// ============================================================================
// Store pages suite. Proves (1) provisionTenant seeds the default published
// policy pages (privacy/returns/terms/about) so storefront footer links resolve
// and the store is compliant from day one, and (2) the admin store-pages data
// layer (lib/admin/pages.ts) round-trips create → list → read → update → delete
// under withTenant RLS.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";

process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";

import { provisionTenant, createAppUser } from "../../../apps/web/lib/auth/provision";
import {
  listStorePages,
  getStorePageBySlug,
  upsertStorePage,
  deleteStorePage,
} from "../../../apps/web/lib/admin/pages";

const RUN = Date.now().toString(36);
const SLUG = `pages-${RUN}`;
const EMAIL = `pages-owner-${RUN}@store.test`;

let tenantId = "";
let userId = "";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from tenant where slug = ${SLUG}`;
    await tx`delete from app_user where email = ${EMAIL}`;
  });
}

describe("Store pages", () => {
  beforeAll(async () => {
    await cleanup();
    const owner = await createAppUser({ email: EMAIL, fullName: "Pages Owner" });
    userId = owner.userId;
    const res = await provisionTenant({ userId, storeName: "Pages Store", slug: SLUG });
    tenantId = res.tenantId;
  });

  afterAll(cleanup);

  it("1. provisionTenant seeds the default published policy pages", async () => {
    const pages = await listStorePages(tenantId, userId);
    const bySlug = new Map(pages.map((p) => [p.slug, p]));

    for (const slug of ["privacy", "returns", "terms", "about"]) {
      const p = bySlug.get(slug);
      expect(p, `missing default page ${slug}`).toBeTruthy();
      expect(p!.status).toBe("published");
      expect(p!.title.length).toBeGreaterThan(0);
    }
    // 'home' pages are excluded from the admin list.
    expect(pages.some((p) => p.type === "home")).toBe(false);

    // The body is recoverable for rendering.
    const returns = await getStorePageBySlug(tenantId, userId, "returns");
    expect(returns?.body.length).toBeGreaterThan(10);
  });

  it("2. create → read → list a custom page", async () => {
    await upsertStorePage(tenantId, userId, {
      slug: "shipping-info",
      title: "ডেলিভারি তথ্য",
      body: "ঢাকার ভেতরে ১–২ দিন, ঢাকার বাইরে ৩–৫ দিন।",
      status: "published",
      seoTitle: "Delivery info",
    });

    const page = await getStorePageBySlug(tenantId, userId, "shipping-info");
    expect(page).toBeTruthy();
    expect(page!.title).toBe("ডেলিভারি তথ্য");
    expect(page!.body).toContain("ঢাকার বাইরে");
    expect(page!.seoTitle).toBe("Delivery info");
    expect(page!.status).toBe("published");

    const pages = await listStorePages(tenantId, userId);
    expect(pages.some((p) => p.slug === "shipping-info")).toBe(true);
  });

  it("3. update edits title/body/status by id", async () => {
    const before = await getStorePageBySlug(tenantId, userId, "shipping-info");
    await upsertStorePage(tenantId, userId, {
      id: before!.id,
      slug: "shipping-info",
      title: "ডেলিভারি ও সময়",
      body: "আপডেটেড বডি।",
      status: "draft",
    });

    const after = await getStorePageBySlug(tenantId, userId, "shipping-info");
    expect(after!.id).toBe(before!.id); // same row, not a duplicate
    expect(after!.title).toBe("ডেলিভারি ও সময়");
    expect(after!.body).toBe("আপডেটেড বডি।");
    expect(after!.status).toBe("draft");
  });

  it("4. delete removes the page; home pages are protected", async () => {
    const page = await getStorePageBySlug(tenantId, userId, "shipping-info");
    const res = await deleteStorePage(tenantId, userId, page!.id);
    expect(res.slug).toBe("shipping-info");
    expect(await getStorePageBySlug(tenantId, userId, "shipping-info")).toBeNull();

    // The 'home' page cannot be deleted via this path (type <> 'home' guard).
    const home = await asPlatformAdmin((tx) =>
      tx<{ id: string }[]>`select id from store_page where tenant_id = ${tenantId} and type = 'home' limit 1`,
    );
    if (home[0]) {
      await deleteStorePage(tenantId, userId, home[0].id);
      const still = await asPlatformAdmin((tx) =>
        tx<{ n: string }[]>`select count(*)::bigint as n from store_page where id = ${home[0]!.id}`,
      );
      expect(Number(still[0]?.n)).toBe(1);
    }
  });
});
