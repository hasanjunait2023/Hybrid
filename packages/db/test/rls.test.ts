// ============================================================================
// RLS isolation suite — THE Phase-0 gate.
//
// Runs against the real Docker Postgres through the REAL withTenant /
// asPlatformAdmin, as the non-superuser app_runtime_login role (RLS FORCED).
// Uses the fixed seed UUIDs from sql/03_seed.sql.
// ============================================================================
import { describe, it, expect, beforeAll } from "vitest";
import { withTenant, asPlatformAdmin } from "../src/index";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b";
const OWNER_A = "11111111-1111-1111-1111-111111111001";

describe("RLS tenant isolation", () => {
  // Make the order_number sequencing test deterministic across local re-runs:
  // clear any orders/counters left by a prior run (CI starts from a fresh seed,
  // where this is a no-op). order_counter is intentionally NOT pre-seeded.
  beforeAll(async () => {
    await asPlatformAdmin(async (tx) => {
      await tx`delete from orders where tenant_id in (${TENANT_A}, ${TENANT_B})`;
      await tx`delete from order_counter where tenant_id in (${TENANT_A}, ${TENANT_B})`;
    });
  });

  it("1. tenant A sees only A's products", async () => {
    const rows = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ tenant_id: string }[]>`select tenant_id from product`,
    );
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.tenant_id === TENANT_A)).toBe(true);
  });

  it("2. tenant A querying within A cannot read B's rows (0 cross-tenant)", async () => {
    const rows = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ n: number }[]>`select count(*)::int as n from product where tenant_id = ${TENANT_B}`,
    );
    expect(rows[0]?.n).toBe(0);
  });

  it("3. cross-tenant INSERT is rejected by WITH CHECK", async () => {
    await expect(
      withTenant(TENANT_A, OWNER_A, async (tx) => {
        await tx`
          insert into product (tenant_id, title, slug, status)
          values (${TENANT_B}, 'sneaky', 'sneaky-cross', 'active')
        `;
      }),
    ).rejects.toThrow();

    // And nothing leaked: B (via admin) still has exactly its 3 seeded products.
    const rows = await asPlatformAdmin((tx) =>
      tx<{ n: number }[]>`select count(*)::int as n from product where tenant_id = ${TENANT_B}`,
    );
    expect(rows[0]?.n).toBe(3);
  });

  it("4. platform admin sees both A and B", async () => {
    const rows = await asPlatformAdmin((tx) =>
      tx<{ tenant_id: string }[]>`select distinct tenant_id from product order by tenant_id`,
    );
    const tenants = rows.map((r) => r.tenant_id);
    expect(tenants).toContain(TENANT_A);
    expect(tenants).toContain(TENANT_B);
  });

  it("5. order_number sequences independently per tenant (A:1, B:1, A:2)", async () => {
    const a1 = await placeOrder(TENANT_A);
    const b1 = await placeOrder(TENANT_B);
    const a2 = await placeOrder(TENANT_A);
    expect(a1).toBe(1);
    expect(b1).toBe(1);
    expect(a2).toBe(2);
  });
});

// Inserts an order under the tenant's RLS context and returns its order_number.
// Exercises the assign_order_number() trigger + order_counter ON CONFLICT path
// under FORCE RLS (proves app_runtime_login's grants + WITH CHECK both pass).
async function placeOrder(tenantId: string): Promise<number> {
  const rows = await withTenant(tenantId, OWNER_A, (tx) =>
    tx<{ order_number: string }[]>`
      insert into orders (tenant_id, customer_name, grand_total)
      values (${tenantId}, 'RLS Test', 0)
      returning order_number
    `,
  );
  return Number(rows[0]?.order_number);
}
