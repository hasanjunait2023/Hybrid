"use server";

// Staff management Server Actions (P2-2). RBAC: only owner/admin may manage
// staff; only an owner may grant or revoke the owner role. The data layer guards
// the last-owner invariant. Tenant resolved from the session membership.
import { z } from "zod";
import { revalidateTag } from "next/cache";
import {
  addMember,
  changeMemberRole,
  removeMember,
  hasRole,
  getMemberRole,
  getMemberRoleByEmail,
  StaffError,
  type MemberRole,
} from "@/lib/admin/staff";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { recordAudit } from "@/lib/audit/record";

export interface StaffActionResult {
  ok: boolean;
  error?: string;
}

const RoleEnum = z.enum(["owner", "admin", "staff"]);

async function authManager(): Promise<
  { ok: true; tenantId: string; userId: string; role: MemberRole } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  const role = await getMemberRole(tenantId, session.userId);
  if (role !== "owner" && role !== "admin") {
    return { ok: false, error: "এই কাজের অনুমতি নেই (শুধু মালিক/অ্যাডমিন)।" };
  }
  return { ok: true, tenantId, userId: session.userId, role };
}

function bust(tenantId: string): void {
  revalidateTag(`tenant:${tenantId}:staff`);
}

const AddInput = z.object({
  email: z.string().trim().email("সঠিক ইমেইল দিন"),
  role: RoleEnum,
  fullName: z.string().trim().max(120).optional(),
});

export async function addMemberAction(
  email: string,
  role: string,
  fullName?: string,
): Promise<StaffActionResult> {
  const auth = await authManager();
  if (!auth.ok) return auth;
  const parsed = AddInput.safeParse({ email, role, fullName });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "অবৈধ ইনপুট।" };
  // Only an owner may create another owner.
  if (parsed.data.role === "owner" && auth.role !== "owner") {
    return { ok: false, error: "শুধু মালিক আরেকজন মালিক যোগ করতে পারেন।" };
  }
  // Only an owner may change an EXISTING owner — the upsert would otherwise let
  // a non-owner demote the owner by re-adding their email with a lower role.
  if (auth.role !== "owner" && (await getMemberRoleByEmail(auth.tenantId, parsed.data.email)) === "owner") {
    return { ok: false, error: "শুধু মালিক মালিকের ভূমিকা পরিবর্তন করতে পারেন।" };
  }
  await addMember(auth.tenantId, parsed.data.email, parsed.data.role, parsed.data.fullName);
  bust(auth.tenantId);
  await recordAudit({
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: "member.invite",
    resourceType: "user",
    resourceId: parsed.data.email,
    details: { role: parsed.data.role },
  });
  return { ok: true };
}

export async function changeRoleAction(userId: string, role: string): Promise<StaffActionResult> {
  const auth = await authManager();
  if (!auth.ok) return auth;
  const r = RoleEnum.safeParse(role);
  const id = z.string().uuid().safeParse(userId);
  if (!r.success || !id.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  if (r.data === "owner" && auth.role !== "owner") {
    return { ok: false, error: "শুধু মালিক মালিক-ভূমিকা দিতে পারেন।" };
  }
  // A non-owner may not change an existing owner's role (demotion guard) —
  // mirrors removeMemberAction.
  if (auth.role !== "owner" && (await hasRole(auth.tenantId, id.data, ["owner"]))) {
    return { ok: false, error: "শুধু মালিক মালিকের ভূমিকা পরিবর্তন করতে পারেন।" };
  }
  try {
    await changeMemberRole(auth.tenantId, id.data, r.data);
  } catch (e) {
    if (e instanceof StaffError && e.message === "LAST_OWNER") {
      return { ok: false, error: "শেষ মালিককে পরিবর্তন করা যাবে না।" };
    }
    return { ok: false, error: "ভূমিকা পরিবর্তন ব্যর্থ হয়েছে।" };
  }
  bust(auth.tenantId);
  await recordAudit({
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: "member.role_change",
    resourceType: "user",
    resourceId: id.data,
    details: { newRole: r.data },
  });
  return { ok: true };
}

export async function removeMemberAction(userId: string): Promise<StaffActionResult> {
  const auth = await authManager();
  if (!auth.ok) return auth;
  const id = z.string().uuid().safeParse(userId);
  if (!id.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  // Only an owner may remove an owner.
  if (auth.role !== "owner" && (await hasRole(auth.tenantId, id.data, ["owner"]))) {
    return { ok: false, error: "শুধু মালিক মালিককে সরাতে পারেন।" };
  }
  try {
    await removeMember(auth.tenantId, id.data);
  } catch (e) {
    if (e instanceof StaffError && e.message === "LAST_OWNER") {
      return { ok: false, error: "শেষ মালিককে সরানো যাবে না।" };
    }
    return { ok: false, error: "সরানো ব্যর্থ হয়েছে।" };
  }
  await recordAudit({
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: "member.remove",
    resourceType: "user",
    resourceId: id.data,
  });
  bust(auth.tenantId);
  return { ok: true };
}
