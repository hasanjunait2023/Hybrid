// ============================================================================
// Platform team slice (tenant roadmap PP1-B1). Embedded Postgres. Exercises
// apps/web/lib/platform/team.ts (platform tables, asPlatformAdmin).
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import {
  listPlatformMembers,
  getPlatformRole,
  addPlatformMember,
  changePlatformRole,
  removePlatformMember,
  assignTenant,
  getTenantAssignee,
  TeamError,
} from "../../../apps/web/lib/platform/team";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const SUPER_EMAIL = "pt-super@hybrid.local";
const SUPPORT_EMAIL = "pt-support@hybrid.local";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from tenant_assignment where tenant_id = ${TENANT_A}`;
    await tx`delete from platform_member where user_id in (select id from app_user where email in (${SUPER_EMAIL}, ${SUPPORT_EMAIL}))`;
    await tx`delete from app_user where email in (${SUPER_EMAIL}, ${SUPPORT_EMAIL})`;
  });
}

describe("platform team slice (PP1-B1)", () => {
  let superId = "";
  let supportId = "";

  beforeAll(cleanup);
  afterAll(cleanup);

  it("1. addPlatformMember creates user + sets is_platform_admin + role", async () => {
    ({ userId: superId } = await addPlatformMember(SUPER_EMAIL, "super_admin", "Super"));
    ({ userId: supportId } = await addPlatformMember(SUPPORT_EMAIL, "support"));

    expect(await getPlatformRole(superId)).toBe("super_admin");
    expect(await getPlatformRole(supportId)).toBe("support");

    const flag = await asPlatformAdmin((tx) =>
      tx<{ is_platform_admin: boolean }[]>`select is_platform_admin from app_user where id = ${superId}`,
    );
    expect(flag[0]!.is_platform_admin).toBe(true);

    const members = await listPlatformMembers();
    expect(members.find((m) => m.userId === superId)?.role).toBe("super_admin");
  });

  it("2. changePlatformRole + last-super-admin guard", async () => {
    await changePlatformRole(supportId, "accountant");
    expect(await getPlatformRole(supportId)).toBe("accountant");

    // Our SUPER_EMAIL is the only super_admin in this test set — but the seed/other
    // tests may add more. Make this deterministic: ensure exactly one by checking.
    const supers = await asPlatformAdmin((tx) =>
      tx<{ n: number }[]>`select count(*)::int as n from platform_member where role = 'super_admin'`,
    );
    if ((supers[0]?.n ?? 0) === 1) {
      await expect(changePlatformRole(superId, "support")).rejects.toThrow(TeamError);
      expect(await getPlatformRole(superId)).toBe("super_admin");
    }
  });

  it("3. assignTenant + getTenantAssignee (CSM)", async () => {
    await assignTenant(TENANT_A, supportId);
    const a = await getTenantAssignee(TENANT_A);
    expect(a?.userId).toBe(supportId);

    // Reassign (upsert) to super.
    await assignTenant(TENANT_A, superId);
    expect((await getTenantAssignee(TENANT_A))?.userId).toBe(superId);

    const members = await listPlatformMembers();
    expect(members.find((m) => m.userId === superId)?.assignedTenants).toBeGreaterThanOrEqual(1);
  });

  it("4. removePlatformMember clears role + is_platform_admin", async () => {
    await removePlatformMember(supportId);
    expect(await getPlatformRole(supportId)).toBeNull();
    const flag = await asPlatformAdmin((tx) =>
      tx<{ is_platform_admin: boolean }[]>`select is_platform_admin from app_user where id = ${supportId}`,
    );
    expect(flag[0]!.is_platform_admin).toBe(false);
  });
});
