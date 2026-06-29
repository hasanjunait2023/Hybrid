// ============================================================================
// Bulk product editor suite. Verifies bulkSetProductStatus and
// bulkAdjustVariantPrices operate only on the selected products, scope to the
// tenant, and keep prices >= 0. Isolated on a freshly provisioned tenant.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";

process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";

import { provisionTenant, createAppUser } from "../../../apps/web/lib/auth/provision";
import { bulkSetProductStatus, bulkAdjustVariantPrices } from "../../../apps/web/lib/admin/catalog";

const RUN = Date.now().toString(36);
const SLUG = `bulk-${RUN}`;
const EMAIL = `bulk-${RUN}@store.test`;

let tenantId = "";
let userId = "";
const p: Record<string, string> = {}; // label → product id

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from tenant where slug = ${SLUG}`;
    await tx`delete from app_user where email = ${EMAIL}`;
  });
}

async function priceOf(productId: string): Promise<number> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ price: string }[]>`select price from product_variant where product_id = ${productId} limit 1`,
  );
  return Number(rows[0]!.price);
}

async function statusOf(productId: string): Promise<string> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ status: string }[]>`select status from product where id = ${productId}`,
  );
  return rows[0]!.status;
}

describe("Bulk product editor", () => {
  beforeAll(async () => {
    await cleanup();
    userId = (await createAppUser({ email: EMAIL, fullName: "Bulk Owner" })).userId;
    tenantId = (await provisionTenant({ userId, storeName: "Bulk Store", slug: SLUG })).tenantId;

    await asPlatformAdmin(async (tx) => {
      for (const [label, price] of [
        ["a", 100],
        ["b", 200],
        ["c", 300],
      ] as const) {
        const rows = await tx<{ id: string }[]>`
          insert into product (tenant_id, title, slug, status)
          values (${tenantId}, ${`P-${label}`}, ${`p-${label}`}, 'active')
          returning id
        `;
        p[label] = rows[0]!.id;
        await tx`
          insert into product_variant (tenant_id, product_id, price, is_active)
          values (${tenantId}, ${p[label]}, ${price}, true)
        `;
      }
    });
  });

  afterAll(cleanup);

  it("1. bulkSetProductStatus changes only the selected products", async () => {
    const changed = await bulkSetProductStatus(tenantId, userId, [p.a!, p.b!], "archived");
    expect(changed.sort()).toEqual([p.a!, p.b!].sort());
    expect(await statusOf(p.a!)).toBe("archived");
    expect(await statusOf(p.b!)).toBe("archived");
    expect(await statusOf(p.c!)).toBe("active"); // untouched
  });

  it("2. bulkAdjustVariantPrices applies a percentage to selected products only", async () => {
    const touched = await bulkAdjustVariantPrices(tenantId, userId, [p.a!], 10);
    expect(touched).toEqual([p.a!]);
    expect(await priceOf(p.a!)).toBeCloseTo(110, 2); // 100 * 1.10
    expect(await priceOf(p.b!)).toBeCloseTo(200, 2); // unchanged
  });

  it("3. a negative adjustment lowers price; never below zero", async () => {
    await bulkAdjustVariantPrices(tenantId, userId, [p.c!], -25);
    expect(await priceOf(p.c!)).toBeCloseTo(225, 2); // 300 * 0.75

    // Clamp: -100% (or beyond) floors at 0, never negative.
    await bulkAdjustVariantPrices(tenantId, userId, [p.c!], -100);
    expect(await priceOf(p.c!)).toBe(0);
  });

  it("4. empty selection is a no-op", async () => {
    expect(await bulkSetProductStatus(tenantId, userId, [], "draft")).toEqual([]);
    expect(await bulkAdjustVariantPrices(tenantId, userId, [], 10)).toEqual([]);
  });
});
