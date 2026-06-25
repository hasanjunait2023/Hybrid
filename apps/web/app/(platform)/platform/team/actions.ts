"use server";

// Platform team Server Actions (PP1-B1). Only a super-admin manages the team —
// EXCEPT a legacy bootstrap admin (is_platform_admin=true but no platform_member
// row yet) so the first member can be added. support/sales/ops/accountant cannot.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getPlatformAdmin } from "@/lib/platform/auth";
import {
  addPlatformMember,
  changePlatformRole,
  removePlatformMember,
  getPlatformRole,
  TeamError,
} from "@/lib/platform/team";

export interface TeamActionResult {
  ok: boolean;
  error?: string;
}

const RoleEnum = z.enum(["super_admin", "support", "sales", "accountant", "ops"]);

async function authSuper(): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await getPlatformAdmin();
  if (!admin) return { ok: false, error: "অনুমতি নেই।" };
  const role = await getPlatformRole(admin.userId);
  // role === null → bootstrap admin (no member row yet); allow.
  if (role !== null && role !== "super_admin") return { ok: false, error: "শুধু super-admin টিম পরিচালনা করতে পারেন।" };
  return { ok: true };
}

const AddInput = z.object({
  email: z.string().trim().email("সঠিক ইমেইল দিন"),
  role: RoleEnum,
  fullName: z.string().trim().max(120).optional(),
});

export async function addTeamMemberAction(email: string, role: string, fullName?: string): Promise<TeamActionResult> {
  const auth = await authSuper();
  if (!auth.ok) return auth;
  const parsed = AddInput.safeParse({ email, role, fullName });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "অবৈধ ইনপুট।" };
  await addPlatformMember(parsed.data.email, parsed.data.role, parsed.data.fullName);
  revalidatePath("/platform/team");
  return { ok: true };
}

export async function changeTeamRoleAction(userId: string, role: string): Promise<TeamActionResult> {
  const auth = await authSuper();
  if (!auth.ok) return auth;
  const id = z.string().uuid().safeParse(userId);
  const r = RoleEnum.safeParse(role);
  if (!id.success || !r.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  try {
    await changePlatformRole(id.data, r.data);
  } catch (e) {
    if (e instanceof TeamError && e.message === "LAST_SUPER_ADMIN") return { ok: false, error: "শেষ super-admin পরিবর্তন করা যাবে না।" };
    return { ok: false, error: "ব্যর্থ হয়েছে।" };
  }
  revalidatePath("/platform/team");
  return { ok: true };
}

export async function removeTeamMemberAction(userId: string): Promise<TeamActionResult> {
  const auth = await authSuper();
  if (!auth.ok) return auth;
  const id = z.string().uuid().safeParse(userId);
  if (!id.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  try {
    await removePlatformMember(id.data);
  } catch (e) {
    if (e instanceof TeamError && e.message === "LAST_SUPER_ADMIN") return { ok: false, error: "শেষ super-admin সরানো যাবে না।" };
    return { ok: false, error: "ব্যর্থ হয়েছে।" };
  }
  revalidatePath("/platform/team");
  return { ok: true };
}
