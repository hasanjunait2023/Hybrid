// ============================================================================
// Discount performance report suite. Verifies getDiscountPerformance aggregates
// orders per code — counting orders, summing the discount given and the gross
// revenue — while excluding cancelled orders and NULL-code orders. Isolated on a
// freshly provisioned tenant.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";

process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";

import { provisionTenant, createAppUser } from "../../../apps/web/lib/auth/provision";
import { getDiscountPerformance } from "../../../apps/web/lib/admin/discounts";

const RUN = Date.now().toString(36);
const SLUG = `disc-rep-${RUN}`;
const EMAIL = `disc-rep-${RUN}@store.test`;

let tenantId = "";
let userId = "";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from tenant where slug = ${SLUG}`;
    await tx`delete from app_user where email = ${EMAIL}`;
  });
}

async function order(
  code: string | null,
  discount: number,
  grand: number,
  status: string,
): Promise<void> {
  await asPlatformAdmin(
    (tx) => tx`
      insert into orders (tenant_id, discount_code, discount_total, grand_total, fulfillment_status)
      values (${tenantId}, ${code}, ${discount}, ${grand}, ${status}::order_fulfillment_status)
    `,
  );
}

describe("Discount performance report", () => {
  beforeAll(async () => {
    await cleanup();
    userId = (await createAppUser({ email: EMAIL, fullName: "Disc Owner" })).userId;
    tenantId = (await provisionTenant({ userId, storeName: "Disc Store", slug: SLUG })).tenantId;

    await order("SAVE20", 20, 100, "confirmed");
    await order("SAVE20", 20, 100, "delivered");
    await order("SAVE20", 20, 100, "cancelled"); // excluded — no revenue
    await order("FREESHIP", 0, 50, "confirmed");
    await order(null, 0, 999, "confirmed"); // no code — excluded
  });

  afterAll(cleanup);

  it("1. aggregates orders, discount given, and revenue per code (excludes cancelled + null)", async () => {
    const rows = await getDiscountPerformance(tenantId, userId);
    const byCode = new Map(rows.map((r) => [r.code, r]));

    // Only SAVE20 + FREESHIP appear; the null-code order is excluded entirely.
    expect(rows.map((r) => r.code).sort()).toEqual(["FREESHIP", "SAVE20"]);

    const save = byCode.get("SAVE20")!;
    expect(save.ordersCount).toBe(2); // cancelled one excluded
    expect(save.totalDiscount).toBe(40);
    expect(save.revenue).toBe(200);

    const free = byCode.get("FREESHIP")!;
    expect(free.ordersCount).toBe(1);
    expect(free.totalDiscount).toBe(0);
    expect(free.revenue).toBe(50);
  });

  it("2. rows are ordered by revenue descending", async () => {
    const rows = await getDiscountPerformance(tenantId, userId);
    expect(rows[0]?.code).toBe("SAVE20"); // 200 > 50
  });
});
