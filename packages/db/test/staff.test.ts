// ============================================================================
// Staff & RBAC slice (tenant roadmap P2-2). Embedded Postgres. Exercises
// apps/web/lib/admin/staff.ts (asPlatformAdmin with explicit tenant_id filters).
//
// Proves: addMember creates app_user + membership; getMemberRole/listMembers;
// changeMemberRole; the last-owner invariant blocks demoting/removing the sole
// owner; hasRole gate.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import {
  listMembers,
  getMemberRole,
  addMember,
  changeMemberRole,
  removeMember,
  hasRole,
} from "../../../apps/web/lib/admin/staff";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const OWNER_A = "11111111-1111-1111-1111-111111111001";
const STAFF_EMAIL = "p2-staff-test@hybrid.local";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`
      delete from tenant_member
      where tenant_id = ${TENANT_A}
        and user_id in (select id from app_user where email = ${STAFF_EMAIL})
    `;
    await tx`delete from app_user where email = ${STAFF_EMAIL}`;
  });
}

describe("staff & RBAC slice", () => {
  let staffUserId = "";

  beforeAll(cleanup);
  afterAll(cleanup);

  it("1. addMember creates the user + membership", async () => {
    const { userId } = await addMember(TENANT_A, STAFF_EMAIL, "staff", "Test Staff");
    staffUserId = userId;
    expect(await getMemberRole(TENANT_A, staffUserId)).toBe("staff");

    const members = await listMembers(TENANT_A);
    const row = members.find((m) => m.userId === staffUserId);
    expect(row?.email).toBe(STAFF_EMAIL);
    expect(row?.role).toBe("staff");
  });

  it("2. addMember is idempotent on (tenant,user) — updates role", async () => {
    const again = await addMember(TENANT_A, STAFF_EMAIL, "admin");
    expect(again.userId).toBe(staffUserId);
    expect(await getMemberRole(TENANT_A, staffUserId)).toBe("admin");
  });

  it("3. changeMemberRole updates the role", async () => {
    await changeMemberRole(TENANT_A, staffUserId, "staff");
    expect(await getMemberRole(TENANT_A, staffUserId)).toBe("staff");
  });

  it("4. last-owner invariant blocks demoting / removing the sole owner", async () => {
    // OWNER_A is the only owner of TENANT_A.
    await expect(changeMemberRole(TENANT_A, OWNER_A, "staff")).rejects.toThrow();
    await expect(removeMember(TENANT_A, OWNER_A)).rejects.toThrow();
    // Still owner.
    expect(await getMemberRole(TENANT_A, OWNER_A)).toBe("owner");
  });

  it("5. hasRole gate + removeMember", async () => {
    expect(await hasRole(TENANT_A, OWNER_A, ["owner", "admin"])).toBe(true);
    expect(await hasRole(TENANT_A, staffUserId, ["owner", "admin"])).toBe(false);

    await removeMember(TENANT_A, staffUserId);
    expect(await getMemberRole(TENANT_A, staffUserId)).toBeNull();
  });
});
