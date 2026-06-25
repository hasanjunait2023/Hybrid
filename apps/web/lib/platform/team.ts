// Internal team management (tenant roadmap PP1-B1). Hybrid's own staff + their
// platform role + tenant (account-manager) assignments. Platform tables, gated
// by app.is_platform_admin() — all access via asPlatformAdmin. Adding a member
// sets app_user.is_platform_admin (the coarse gate) alongside the granular role.
import { asPlatformAdmin } from "@hybrid/db";

export type PlatformRole = "super_admin" | "support" | "sales" | "accountant" | "ops";

export interface PlatformMember {
  userId: string;
  email: string;
  fullName: string | null;
  role: PlatformRole;
  assignedTenants: number;
}

export class TeamError extends Error {}

export async function listPlatformMembers(): Promise<PlatformMember[]> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ user_id: string; email: string; full_name: string | null; role: PlatformRole; assigned: number }[]>`
      select m.user_id, u.email::text as email, u.full_name, m.role,
        (select count(*) from tenant_assignment a where a.user_id = m.user_id)::int as assigned
      from platform_member m
      join app_user u on u.id = m.user_id
      order by case m.role when 'super_admin' then 0 when 'accountant' then 1 when 'support' then 2 when 'sales' then 3 else 4 end,
               m.created_at asc
    `,
  );
  return rows.map((r) => ({
    userId: r.user_id, email: r.email, fullName: r.full_name, role: r.role, assignedTenants: r.assigned,
  }));
}

export async function getPlatformRole(userId: string): Promise<PlatformRole | null> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ role: PlatformRole }[]>`select role from platform_member where user_id = ${userId} limit 1`,
  );
  return rows[0]?.role ?? null;
}

export async function addPlatformMember(email: string, role: PlatformRole, fullName?: string): Promise<{ userId: string }> {
  const normEmail = email.trim().toLowerCase();
  return asPlatformAdmin(async (tx) => {
    const existing = await tx<{ id: string }[]>`select id from app_user where email = ${normEmail} limit 1`;
    let userId = existing[0]?.id;
    if (!userId) {
      const created = await tx<{ id: string }[]>`
        insert into app_user (email, full_name, is_platform_admin) values (${normEmail}, ${fullName ?? null}, true) returning id
      `;
      userId = created[0]!.id;
    } else {
      await tx`update app_user set is_platform_admin = true where id = ${userId}`;
    }
    await tx`
      insert into platform_member (user_id, role) values (${userId}, ${role}::platform_role)
      on conflict (user_id) do update set role = excluded.role, updated_at = now()
    `;
    return { userId };
  });
}

export async function changePlatformRole(userId: string, role: PlatformRole): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    if (role !== "super_admin") {
      const supers = await tx<{ n: number }[]>`select count(*)::int as n from platform_member where role = 'super_admin'`;
      const isSuper = await tx<{ one: number }[]>`select 1 as one from platform_member where user_id = ${userId} and role = 'super_admin' limit 1`;
      if (isSuper.length > 0 && (supers[0]?.n ?? 0) <= 1) throw new TeamError("LAST_SUPER_ADMIN");
    }
    await tx`update platform_member set role = ${role}::platform_role, updated_at = now() where user_id = ${userId}`;
  });
}

export async function removePlatformMember(userId: string): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    const isSuper = await tx<{ one: number }[]>`select 1 as one from platform_member where user_id = ${userId} and role = 'super_admin' limit 1`;
    if (isSuper.length > 0) {
      const supers = await tx<{ n: number }[]>`select count(*)::int as n from platform_member where role = 'super_admin'`;
      if ((supers[0]?.n ?? 0) <= 1) throw new TeamError("LAST_SUPER_ADMIN");
    }
    await tx`delete from tenant_assignment where user_id = ${userId}`;
    await tx`delete from platform_member where user_id = ${userId}`;
    await tx`update app_user set is_platform_admin = false where id = ${userId}`;
  });
}

export async function assignTenant(tenantId: string, userId: string): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`
      insert into tenant_assignment (tenant_id, user_id) values (${tenantId}, ${userId})
      on conflict (tenant_id) do update set user_id = excluded.user_id, assigned_at = now()
    `;
  });
}

export async function getTenantAssignee(tenantId: string): Promise<{ userId: string; name: string | null; email: string } | null> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ user_id: string; name: string | null; email: string }[]>`
      select a.user_id, u.full_name as name, u.email::text as email
      from tenant_assignment a join app_user u on u.id = a.user_id
      where a.tenant_id = ${tenantId} limit 1
    `,
  );
  return rows[0] ? { userId: rows[0].user_id, name: rows[0].name, email: rows[0].email } : null;
}
