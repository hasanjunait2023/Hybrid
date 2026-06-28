// ============================================================================
// Marketplace RLS suite — base-layer isolation gate (migration 22).
//
// Proves the marketplace's two isolation properties against the real
// app_runtime_login role (RLS FORCED), through the REAL withTenant /
// asPlatformAdmin / withBuyer helpers:
//
//   1. Catalog projection (marketplace_listing/category/variant) is
//      WORLD-READABLE — a buyer (non-admin context) sees EVERY vendor's
//      listings (the intended cross-vendor catalog), not just one tenant's.
//   2. Buyer-owned rows (marketplace_order/suborder/commission) are isolated —
//      buyer A never sees buyer B's orders; a tenant context sees none; a vendor
//      sees only its own commission.
// ============================================================================
import { describe, it, expect, beforeAll } from "vitest";
import { withTenant, asPlatformAdmin, withBuyer } from "../src/index";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b";
const OWNER_A = "11111111-1111-1111-1111-111111111001";
const OWNER_B = "11111111-1111-1111-1111-111111111002";
const BUYER_A = "cccccccc-cccc-cccc-cccc-ccccccccc00a";
const BUYER_B = "cccccccc-cccc-cccc-cccc-ccccccccc00b";

async function firstProductId(tenantId: string): Promise<string> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ id: string }[]>`select id from product where tenant_id = ${tenantId} order by id limit 1`,
  );
  return rows[0]!.id;
}

describe("Marketplace RLS isolation", () => {
  beforeAll(async () => {
    const prodA = await firstProductId(TENANT_A);
    const prodB = await firstProductId(TENANT_B);

    await asPlatformAdmin(async (tx) => {
      // Clean slate (local re-runs).
      await tx`delete from marketplace_commission where tenant_id in (${TENANT_A}, ${TENANT_B})`;
      await tx`delete from marketplace_suborder where buyer_id in (${BUYER_A}, ${BUYER_B})`;
      await tx`delete from marketplace_order where buyer_id in (${BUYER_A}, ${BUYER_B})`;
      await tx`delete from marketplace_listing where tenant_id in (${TENANT_A}, ${TENANT_B})`;
      await tx`delete from marketplace_customer where id in (${BUYER_A}, ${BUYER_B})`;

      // Two buyers.
      await tx`
        insert into marketplace_customer (id, phone, name) values
          (${BUYER_A}, '+8801700000001', 'Buyer A'),
          (${BUYER_B}, '+8801700000002', 'Buyer B')
      `;

      // One listing per vendor (world-readable catalog).
      await tx`
        insert into marketplace_listing (product_id, tenant_id, vendor_slug, vendor_name, title, slug, price_from)
        values
          (${prodA}, ${TENANT_A}, 'store-a', 'Store A', 'A item', 'a-item', 100),
          (${prodB}, ${TENANT_B}, 'store-b', 'Store B', 'B item', 'b-item', 200)
      `;

      // One parent order per buyer.
      await tx`
        insert into marketplace_order
          (buyer_id, status, contact_name, contact_phone, ship_division, ship_district, ship_thana, ship_line)
        values
          (${BUYER_A}, 'confirmed', 'Buyer A', '+8801700000001', 'Dhaka', 'Dhaka', 'Gulshan', 'Road 1'),
          (${BUYER_B}, 'confirmed', 'Buyer B', '+8801700000002', 'Dhaka', 'Dhaka', 'Banani', 'Road 2')
      `;

      // One commission row per vendor.
      await tx`
        insert into marketplace_commission (tenant_id, gross, rate, commission_amount) values
          (${TENANT_A}, 100, 0.05, 5),
          (${TENANT_B}, 200, 0.05, 10)
      `;
    });
  });

  it("1. catalog is world-readable: a buyer sees BOTH vendors' listings", async () => {
    const rows = await withBuyer(BUYER_A, (tx) =>
      tx<{ tenant_id: string }[]>`
        select tenant_id from marketplace_listing where tenant_id in (${TENANT_A}, ${TENANT_B})
      `,
    );
    const tenants = rows.map((r) => r.tenant_id);
    expect(tenants).toContain(TENANT_A);
    expect(tenants).toContain(TENANT_B);
  });

  it("2. catalog is readable from a tenant context too (world-read, not tenant-scoped)", async () => {
    const rows = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ n: number }[]>`select count(*)::int as n from marketplace_listing where tenant_id = ${TENANT_B}`,
    );
    expect(rows[0]?.n).toBe(1); // tenant A's context can still see B's PUBLIC listing
  });

  it("3. buyer A sees only their own marketplace_order", async () => {
    const rows = await withBuyer(BUYER_A, (tx) =>
      tx<{ buyer_id: string }[]>`select buyer_id from marketplace_order`,
    );
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.buyer_id === BUYER_A)).toBe(true);
  });

  it("4. buyer A cannot read buyer B's order (0 cross-buyer)", async () => {
    const rows = await withBuyer(BUYER_A, (tx) =>
      tx<{ n: number }[]>`select count(*)::int as n from marketplace_order where buyer_id = ${BUYER_B}`,
    );
    expect(rows[0]?.n).toBe(0);
  });

  it("5. no buyer context (tenant context) sees zero buyer orders", async () => {
    const rows = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ n: number }[]>`select count(*)::int as n from marketplace_order`,
    );
    expect(rows[0]?.n).toBe(0);
  });

  it("6. cross-buyer INSERT is rejected by WITH CHECK", async () => {
    await expect(
      withBuyer(BUYER_A, async (tx) => {
        await tx`
          insert into marketplace_order
            (buyer_id, status, contact_name, contact_phone, ship_division, ship_district, ship_thana, ship_line)
          values
            (${BUYER_B}, 'pending', 'X', '+8801700000003', 'Dhaka', 'Dhaka', 'Mirpur', 'Road 3')
        `;
      }),
    ).rejects.toThrow();
  });

  it("7. vendor sees only its own commission rows", async () => {
    const a = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ tenant_id: string }[]>`select tenant_id from marketplace_commission`,
    );
    expect(a.length).toBe(1);
    expect(a[0]?.tenant_id).toBe(TENANT_A);

    const b = await withTenant(TENANT_B, OWNER_B, (tx) =>
      tx<{ n: number }[]>`select count(*)::int as n from marketplace_commission where tenant_id = ${TENANT_A}`,
    );
    expect(b[0]?.n).toBe(0);
  });

  it("8. platform admin sees all commission rows", async () => {
    const rows = await asPlatformAdmin((tx) =>
      tx<{ tenant_id: string }[]>`
        select tenant_id from marketplace_commission where tenant_id in (${TENANT_A}, ${TENANT_B})
      `,
    );
    expect(rows.length).toBe(2);
  });
});
