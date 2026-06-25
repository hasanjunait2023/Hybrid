// ============================================================================
// Tenant 360 slice (tenant roadmap PP1-A2). Embedded Postgres. Exercises
// apps/web/lib/platform/tenant-detail.ts (asPlatformAdmin, single tenant).
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import { getTenantDetail } from "../../../apps/web/lib/platform/tenant-detail";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";

describe("tenant 360 slice (PP1-A2)", () => {
  const TD_PROD = "e0000018-0000-0000-0000-000000000e18";

  beforeAll(async () => {
    await asPlatformAdmin(async (tx) => {
      await tx`delete from product where id = ${TD_PROD}`;
      await tx`insert into product (id, tenant_id, title, slug, status)
               values (${TD_PROD}, ${TENANT_A}, 'TD Item', 'td-item', 'active')`;
    });
  });

  afterAll(async () => {
    await asPlatformAdmin(async (tx) => {
      await tx`delete from product where id = ${TD_PROD}`;
    });
  });

  it("returns the seeded tenant with profile + usage + gmv", async () => {
    const t = await getTenantDetail(TENANT_A);
    expect(t).not.toBeNull();
    expect(t!.id).toBe(TENANT_A);
    expect(t!.slug).toBeTruthy();
    // The seed gives tenant A products; we added one more.
    expect(t!.usage.products).toBeGreaterThanOrEqual(1);
    expect(typeof t!.gmvAllTime).toBe("number");
    expect(typeof t!.usage.ordersThisMonth).toBe("number");
  });

  it("returns null for an unknown tenant", async () => {
    const t = await getTenantDetail("00000000-0000-0000-0000-000000000000");
    expect(t).toBeNull();
  });
});
