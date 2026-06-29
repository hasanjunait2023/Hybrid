// ============================================================================
// Customer segments suite. Verifies saved segments filter customers by minimum
// orders, minimum spend, and an optional tag — with correct live match counts —
// and that create/list/delete + the per-segment customer view work under
// withTenant RLS. Isolated on a freshly provisioned tenant.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";

process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";

import { provisionTenant, createAppUser } from "../../../apps/web/lib/auth/provision";
import {
  listSegments,
  createSegment,
  deleteSegment,
  getSegmentCustomers,
} from "../../../apps/web/lib/admin/segments";

const RUN = Date.now().toString(36);
const SLUG = `seg-${RUN}`;
const EMAIL = `seg-${RUN}@store.test`;

let tenantId = "";
let userId = "";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from tenant where slug = ${SLUG}`;
    await tx`delete from app_user where email = ${EMAIL}`;
  });
}

describe("Customer segments", () => {
  beforeAll(async () => {
    await cleanup();
    userId = (await createAppUser({ email: EMAIL, fullName: "Seg Owner" })).userId;
    tenantId = (await provisionTenant({ userId, storeName: "Seg Store", slug: SLUG })).tenantId;

    await asPlatformAdmin(async (tx) => {
      // (phone, name, orders, spent, tags)
      const seed: ReadonlyArray<readonly [string, string, number, number, string[]]> = [
        ["+8801900000001", "VIP Repeat", 5, 1000, ["vip"]],
        ["+8801900000002", "One Timer", 1, 200, []],
        ["+8801900000003", "VIP Mid", 3, 500, ["vip"]],
      ];
      for (const [phone, name, orders, spent, tags] of seed) {
        await tx`
          insert into customer (tenant_id, phone, name, orders_count, total_spent, tags)
          values (${tenantId}, ${phone}, ${name}, ${orders}, ${spent}, ${tags})
        `;
      }
    });
  });

  afterAll(cleanup);

  it("1. create + list with correct match counts", async () => {
    await createSegment(tenantId, userId, { name: "Repeat", minOrders: 2, minSpent: 0 });
    await createSegment(tenantId, userId, { name: "VIP", minOrders: 0, minSpent: 0, tag: "vip" });
    await createSegment(tenantId, userId, { name: "Big spenders", minOrders: 0, minSpent: 600 });

    const segments = await listSegments(tenantId, userId);
    const byName = new Map(segments.map((s) => [s.name, s]));

    expect(byName.get("Repeat")?.matchCount).toBe(2); // 5 + 3 orders
    expect(byName.get("VIP")?.matchCount).toBe(2); // two vip-tagged
    expect(byName.get("Big spenders")?.matchCount).toBe(1); // only the 1000 spender
  });

  it("2. getSegmentCustomers returns matching customers, highest spend first", async () => {
    const seg = (await listSegments(tenantId, userId)).find((s) => s.name === "VIP")!;
    const view = await getSegmentCustomers(tenantId, userId, seg.id);
    expect(view?.name).toBe("VIP");
    expect(view?.customers.map((c) => c.name)).toEqual(["VIP Repeat", "VIP Mid"]); // 1000 > 500
    expect(view?.customers.every((c) => c.totalSpent >= 0)).toBe(true);
  });

  it("3. a tag segment excludes untagged customers", async () => {
    const seg = (await listSegments(tenantId, userId)).find((s) => s.name === "VIP")!;
    const view = await getSegmentCustomers(tenantId, userId, seg.id);
    expect(view?.customers.some((c) => c.name === "One Timer")).toBe(false);
  });

  it("4. delete removes the segment", async () => {
    const seg = (await listSegments(tenantId, userId)).find((s) => s.name === "Repeat")!;
    await deleteSegment(tenantId, userId, seg.id);
    const after = await listSegments(tenantId, userId);
    expect(after.some((s) => s.name === "Repeat")).toBe(false);
    expect(await getSegmentCustomers(tenantId, userId, seg.id)).toBeNull();
  });
});
