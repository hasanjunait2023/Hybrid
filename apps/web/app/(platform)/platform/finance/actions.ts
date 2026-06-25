"use server";

// Platform finance Server Actions (PP1-B2). Only super_admin / accountant manage
// the books (legacy bootstrap admin allowed). createdBy stamps the entry.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getPlatformAdmin } from "@/lib/platform/auth";
import { getPlatformRole } from "@/lib/platform/team";
import { addExpense, deleteExpense } from "@/lib/platform/finance";

export interface FinanceActionResult {
  ok: boolean;
  error?: string;
}

async function authFinance(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const admin = await getPlatformAdmin();
  if (!admin) return { ok: false, error: "অনুমতি নেই।" };
  const role = await getPlatformRole(admin.userId);
  if (role !== null && role !== "super_admin" && role !== "accountant") {
    return { ok: false, error: "শুধু super-admin/accountant হিসাব পরিচালনা করতে পারেন।" };
  }
  return { ok: true, userId: admin.userId };
}

const CATEGORIES = ["infra", "sms", "courier", "gateway", "salary", "marketing", "other"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const Input = z.object({
  category: z.enum(CATEGORIES),
  vendor: z.string().trim().max(120).optional(),
  amount: z.coerce.number().min(0).max(100_000_000),
  note: z.string().trim().max(500).optional(),
  incurredOn: z.string().regex(DATE_RE).optional(),
});

export async function addExpenseAction(raw: unknown): Promise<FinanceActionResult> {
  const auth = await authFinance();
  if (!auth.ok) return auth;
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "অবৈধ ইনপুট।" };
  await addExpense({ ...parsed.data, createdBy: auth.userId });
  revalidatePath("/platform/finance");
  return { ok: true };
}

export async function deleteExpenseAction(id: string): Promise<FinanceActionResult> {
  const auth = await authFinance();
  if (!auth.ok) return auth;
  const uid = z.string().uuid().safeParse(id);
  if (!uid.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  await deleteExpense(uid.data);
  revalidatePath("/platform/finance");
  return { ok: true };
}
