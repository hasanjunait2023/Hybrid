// Staff & RBAC data layer (tenant roadmap P2-2). Members live in tenant_member
// (role: owner | admin | staff). Member management reads/writes cross the
// app_user table (RLS-scoped to self), so — exactly like getActiveTenantId —
// these run under asPlatformAdmin with an EXPLICIT tenant_id filter on every
// query. Authorization is the role guard (requireRole) in the Server Actions;
// isolation is the tenant_id filter here.
//
// Membership ≠ login credential. Adding a member creates the app_user + the
// tenant_member link (the authorization). Provisioning a login (GoTrue user /
// password) is a separate, documented step (docs/INFRA_SUPABASE.md §B).
import { asPlatformAdmin } from "@hybrid/db";

export type MemberRole = "owner" | "admin" | "staff";

export interface Member {
  userId: string;
  email: string;
  fullName: string | null;
  role: MemberRole;
  acceptedAt: string | null;
  createdAt: string;
}

export async function listMembers(tenantId: string): Promise<Member[]> {
  const rows = await asPlatformAdmin((tx) =>
    tx<
      {
        user_id: string;
        email: string;
        full_name: string | null;
        role: MemberRole;
        accepted_at: string | null;
        created_at: string;
      }[]
    >`
      select m.user_id, u.email, u.full_name, m.role, m.accepted_at, m.created_at
      from tenant_member m
      join app_user u on u.id = m.user_id
      where m.tenant_id = ${tenantId}
      order by
        case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
        m.created_at asc
    `,
  );
  return rows.map((r) => ({
    userId: r.user_id,
    email: r.email,
    fullName: r.full_name,
    role: r.role,
    acceptedAt: r.accepted_at,
    createdAt: r.created_at,
  }));
}

export async function getMemberRole(tenantId: string, userId: string): Promise<MemberRole | null> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ role: MemberRole }[]>`
      select role from tenant_member where tenant_id = ${tenantId} and user_id = ${userId} limit 1
    `,
  );
  return rows[0]?.role ?? null;
}

// Target's current role by email — used by the add-member guard so a non-owner
// can't demote an existing owner by re-adding their email with a lower role
// (the upsert would otherwise overwrite the role).
export async function getMemberRoleByEmail(
  tenantId: string,
  email: string,
): Promise<MemberRole | null> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ role: MemberRole }[]>`
      select m.role from tenant_member m
      join app_user u on u.id = m.user_id
      where m.tenant_id = ${tenantId} and u.email = ${email.trim().toLowerCase()} limit 1
    `,
  );
  return rows[0]?.role ?? null;
}

export class StaffError extends Error {}

// Add (or re-invite) a member by email. Creates the app_user if new, then links
// it to the tenant with the given role (accepted immediately — the owner is
// adding someone they know). Idempotent on (tenant, user): updates the role.
export async function addMember(
  tenantId: string,
  email: string,
  role: MemberRole,
  fullName?: string,
): Promise<{ userId: string }> {
  const normEmail = email.trim().toLowerCase();
  return asPlatformAdmin(async (tx) => {
    const existing = await tx<{ id: string }[]>`select id from app_user where email = ${normEmail} limit 1`;
    let userId = existing[0]?.id;
    if (!userId) {
      const created = await tx<{ id: string }[]>`
        insert into app_user (email, full_name) values (${normEmail}, ${fullName ?? null})
        returning id
      `;
      userId = created[0]!.id;
    }
    await tx`
      insert into tenant_member (tenant_id, user_id, role, invited_at, accepted_at)
      values (${tenantId}, ${userId}, ${role}::member_role, now(), now())
      on conflict (tenant_id, user_id) do update set role = excluded.role
    `;
    return { userId };
  });
}

export async function changeMemberRole(
  tenantId: string,
  userId: string,
  role: MemberRole,
): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    // Never demote the last owner — the tenant must always have one.
    if (role !== "owner") {
      const owners = await tx<{ n: number }[]>`
        select count(*)::int as n from tenant_member where tenant_id = ${tenantId} and role = 'owner'
      `;
      const isOwner = await tx<{ one: number }[]>`
        select 1 as one from tenant_member
        where tenant_id = ${tenantId} and user_id = ${userId} and role = 'owner' limit 1
      `;
      if (isOwner.length > 0 && (owners[0]?.n ?? 0) <= 1) {
        throw new StaffError("LAST_OWNER");
      }
    }
    await tx`
      update tenant_member set role = ${role}::member_role
      where tenant_id = ${tenantId} and user_id = ${userId}
    `;
  });
}

export async function removeMember(tenantId: string, userId: string): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    const isOwner = await tx<{ one: number }[]>`
      select 1 as one from tenant_member
      where tenant_id = ${tenantId} and user_id = ${userId} and role = 'owner' limit 1
    `;
    if (isOwner.length > 0) {
      const owners = await tx<{ n: number }[]>`
        select count(*)::int as n from tenant_member where tenant_id = ${tenantId} and role = 'owner'
      `;
      if ((owners[0]?.n ?? 0) <= 1) throw new StaffError("LAST_OWNER");
    }
    await tx`delete from tenant_member where tenant_id = ${tenantId} and user_id = ${userId}`;
  });
}

// RBAC primitive for Server Actions. Returns true if the caller's role is in the
// allowed set. owner ⊃ admin ⊃ staff is NOT assumed — pass the exact roles.
export async function hasRole(
  tenantId: string,
  userId: string,
  allowed: MemberRole[],
): Promise<boolean> {
  const role = await getMemberRole(tenantId, userId);
  return role != null && allowed.includes(role);
}
