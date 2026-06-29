// ============================================================================
// Business Health Score + growth coach (Phase R2.3). Heavy coverage of the pure
// computeHealth scoring/recommendation engine, a light integration check that
// getBusinessHealth reads real tenant data under withTenant, and a check that
// the AI seam degrades cleanly (configured:false) with no provider key.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";

process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";
delete process.env.AI_COACH_API_KEY; // ensure the AI seam is unconfigured in test

import { provisionTenant, createAppUser } from "../../../apps/web/lib/auth/provision";
import { computeHealth, getBusinessHealth, type HealthSignals } from "@/lib/admin/healthScore";
import { askGrowthCoach } from "@/lib/ai/coach";

function base(p: Partial<HealthSignals> = {}): HealthSignals {
  return {
    revThisWeek: 0,
    revLastWeek: 0,
    delivered90: 0,
    bad90: 0,
    pending: 0,
    orders7d: 0,
    totalCustomers: 0,
    repeatCustomers: 0,
    activeProducts: 0,
    lowStockProducts: 0,
    lapsedCustomers: 0,
    ...p,
  };
}

const RUN = Date.now().toString(36);
const SLUG = `health-${RUN}`;
const EMAIL = `health-${RUN}@store.test`;
let tenantId = "";
let userId = "";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from orders where tenant_id = ${tenantId}`;
    await tx`delete from product_variant where tenant_id = ${tenantId}`;
    await tx`delete from product where tenant_id = ${tenantId}`;
    await tx`delete from customer where tenant_id = ${tenantId}`;
    await tx`delete from tenant where slug = ${SLUG}`;
    await tx`delete from app_user where email = ${EMAIL}`;
  });
}

describe("Business Health Score", () => {
  beforeAll(async () => {
    userId = (await createAppUser({ email: EMAIL, fullName: "Health Vendor" })).userId;
    tenantId = (await provisionTenant({ userId, storeName: "Health Vendor", slug: SLUG, businessType: "retail" })).tenantId;
  });
  afterAll(cleanup);

  it("1. a thriving store scores high (grade A) with no urgent recommendations", () => {
    const h = computeHealth(
      base({
        revThisWeek: 15000,
        revLastWeek: 10000,
        delivered90: 40,
        bad90: 2,
        pending: 0,
        orders7d: 12,
        totalCustomers: 50,
        repeatCustomers: 25,
        activeProducts: 20,
        lowStockProducts: 0,
        lapsedCustomers: 0,
      }),
    );
    expect(h.score).toBeGreaterThanOrEqual(80);
    expect(h.grade).toBe("A");
    expect(h.factors).toHaveLength(6);
    expect(h.recommendations.every((r) => r.severity !== "high")).toBe(true);
  });

  it("2. a struggling store scores low (grade D) with targeted recommendations", () => {
    const h = computeHealth(
      base({
        revThisWeek: 1000,
        revLastWeek: 5000,
        delivered90: 4,
        bad90: 8, // >60% bad
        pending: 15,
        orders7d: 0,
        totalCustomers: 30,
        repeatCustomers: 1,
        activeProducts: 10,
        lowStockProducts: 6,
        lapsedCustomers: 12,
      }),
    );
    expect(h.score).toBeLessThan(50);
    expect(h.grade).toBe("D");
    const keys = h.recommendations.map((r) => r.key);
    expect(keys).toContain("backlog");
    expect(keys).toContain("cod");
    expect(keys).toContain("stock");
    expect(keys).toContain("winback");
    // The backlog rec carries the pending count.
    expect(h.recommendations.find((r) => r.key === "backlog")!.value).toBe(15);
  });

  it("3. sparse stores get neutral (not punishing) sub-scores", () => {
    const h = computeHealth(base({ totalCustomers: 2, delivered90: 1, activeProducts: 0 }));
    // No data shouldn't crater the score to 0.
    expect(h.score).toBeGreaterThan(30);
    expect(["C", "D", "B"]).toContain(h.grade);
  });

  it("4. getBusinessHealth reads real tenant data and returns a valid shape", async () => {
    await asPlatformAdmin(async (tx) => {
      const p = await tx<{ id: string }[]>`
        insert into product (tenant_id, title, slug, status)
        values (${tenantId}, 'Health Widget', 'health-widget', 'active') returning id`;
      await tx`
        insert into product_variant (tenant_id, product_id, title, price, inventory_quantity, track_inventory)
        values (${tenantId}, ${p[0]!.id}, 'Default', 500, 100, true)`;
      await tx`
        insert into orders (tenant_id, customer_phone, order_number, fulfillment_status, payment_status, subtotal, shipping_total, grand_total, cod_amount, placed_at)
        values (${tenantId}, '01900000001', 1, 'delivered', 'paid', 500, 0, 500, 0, now())`;
    });

    const h = await getBusinessHealth(tenantId, userId);
    expect(h.score).toBeGreaterThanOrEqual(0);
    expect(h.score).toBeLessThanOrEqual(100);
    expect(["A", "B", "C", "D"]).toContain(h.grade);
    expect(h.factors).toHaveLength(6);
    expect(Array.isArray(h.recommendations)).toBe(true);
  });

  it("5. the AI seam is off without a provider key (no fabricated answer)", async () => {
    const reply = await askGrowthCoach("এই মাসে কীভাবে বেশি বিক্রি করব?", {
      score: 70,
      grade: "B",
      factors: "momentum:80",
      highlights: [],
    });
    expect(reply.configured).toBe(false);
    expect(reply.answer).toBeUndefined();
  });
});
