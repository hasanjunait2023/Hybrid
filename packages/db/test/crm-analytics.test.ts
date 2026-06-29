// ============================================================================
// CRM analytics (Phase R1.5). Proves the store-wide reads: RFM distribution
// buckets customers by the same model the Customer 360 badge uses; churn-risk
// surfaces previously-active-now-quiet customers (most-valuable first); cohort
// retention groups by acquisition month and counts who returned. Tenant
// isolation enforced via withTenant. Isolated on a freshly provisioned tenant.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";

process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";

import { provisionTenant, createAppUser } from "../../../apps/web/lib/auth/provision";
import {
  getRfmDistribution,
  getChurnRisk,
  getRetentionCohorts,
} from "@/lib/admin/crmAnalytics";

const RUN = Date.now().toString(36);
const SLUG = `crma-${RUN}`;
const EMAIL = `crma-${RUN}@store.test`;

let tenantId = "";
let userId = "";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from orders where tenant_id = ${tenantId}`;
    await tx`delete from customer where tenant_id = ${tenantId}`;
    await tx`delete from tenant where slug = ${SLUG}`;
    await tx`delete from app_user where email = ${EMAIL}`;
  });
}

// Seed a customer with denormalized counters + a single order at a chosen age,
// all via asPlatformAdmin (the policies carry the is_platform_admin escape).
async function seedCustomer(opts: {
  name: string;
  ordersCount: number;
  totalSpent: number;
  daysAgo: number;
}): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    const c = await tx<{ id: string }[]>`
      insert into customer (tenant_id, name, phone, orders_count, total_spent)
      values (${tenantId}, ${opts.name}, ${`0199${Math.floor(Math.random() * 1e7)}`}, ${opts.ordersCount}, ${opts.totalSpent})
      returning id`;
    await tx`
      insert into orders (tenant_id, customer_id, order_number, fulfillment_status, payment_status,
                          subtotal, shipping_total, grand_total, cod_amount, placed_at)
      values (${tenantId}, ${c[0]!.id}, ${Math.floor(Math.random() * 1e6)}, 'delivered', 'paid',
              ${opts.totalSpent}, 0, ${opts.totalSpent}, 0, now() - make_interval(days => ${opts.daysAgo}))`;
  });
}

describe("CRM analytics", () => {
  beforeAll(async () => {
    userId = (await createAppUser({ email: EMAIL, fullName: "Analytics Vendor" })).userId;
    tenantId = (await provisionTenant({ userId, storeName: "Analytics Vendor", slug: SLUG, businessType: "retail" })).tenantId;

    // champion: recent + frequent. loyal: recent + 2 orders. at_risk: ~150d quiet.
    // lost: ~250d quiet.
    await seedCustomer({ name: "Champ", ordersCount: 6, totalSpent: 60000, daysAgo: 10 });
    await seedCustomer({ name: "Loyal", ordersCount: 3, totalSpent: 4000, daysAgo: 20 });
    await seedCustomer({ name: "Risky", ordersCount: 2, totalSpent: 8000, daysAgo: 150 });
    await seedCustomer({ name: "Gone", ordersCount: 1, totalSpent: 1500, daysAgo: 250 });
  });

  afterAll(cleanup);

  it("1. RFM distribution buckets customers by segment", async () => {
    const dist = await getRfmDistribution(tenantId, userId);
    const by = new Map(dist.map((d) => [d.segment, d]));
    expect(by.get("champion")!.count).toBe(1);
    expect(by.get("loyal")!.count).toBe(1);
    expect(by.get("at_risk")!.count).toBe(1);
    expect(by.get("lost")!.count).toBe(1);
    // The champion's value is summed into its bucket.
    expect(by.get("champion")!.value).toBe(60000);
  });

  it("2. churn risk lists the quiet customers, most-valuable first", async () => {
    const risk = await getChurnRisk(tenantId, userId);
    const names = risk.map((r) => r.name);
    expect(names).toContain("Risky");
    expect(names).toContain("Gone");
    expect(names).not.toContain("Champ");
    // Sorted by total spent desc → Risky (8000) before Gone (1500).
    expect(names.indexOf("Risky")).toBeLessThan(names.indexOf("Gone"));
    expect(risk.find((r) => r.name === "Risky")!.recencyDays).toBeGreaterThanOrEqual(120);
  });

  it("3. retention cohorts count customers and returners by acquisition month", async () => {
    const cohorts = await getRetentionCohorts(tenantId, userId);
    // Only the two recent customers (10d, 20d) fall in the last-6-months window.
    const total = cohorts.reduce((n, c) => n + c.customers, 0);
    expect(total).toBeGreaterThanOrEqual(2);
    // Each cohort's repeat rate is a sane percentage.
    for (const c of cohorts) {
      expect(c.repeatRate).toBeGreaterThanOrEqual(0);
      expect(c.repeatRate).toBeLessThanOrEqual(100);
    }
  });

  it("4. RLS — another tenant's analytics are empty", async () => {
    const otherEmail = `crma-other-${RUN}@store.test`;
    const other = await createAppUser({ email: otherEmail, fullName: "Other" });
    const otherTenant = await provisionTenant({
      userId: other.userId,
      storeName: "Other Vendor",
      slug: `crma-other-${RUN}`,
      businessType: "retail",
    });
    const dist = await getRfmDistribution(otherTenant.tenantId, other.userId);
    expect(dist.every((d) => d.count === 0)).toBe(true);
    expect(await getChurnRisk(otherTenant.tenantId, other.userId)).toHaveLength(0);
    await asPlatformAdmin(async (tx) => {
      await tx`delete from tenant where id = ${otherTenant.tenantId}`;
      await tx`delete from app_user where email = ${otherEmail}`;
    });
  });
});
