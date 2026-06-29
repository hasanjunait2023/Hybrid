"use server";

// Wholesale marketplace monthly-fee Server Actions. Only super_admin / accountant
// manage the marketplace books (legacy bootstrap admin allowed), mirroring the
// platform finance actions.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getPlatformAdmin } from "@/lib/platform/auth";
import { getPlatformRole } from "@/lib/platform/team";
import {
  setMonthlyFee,
  generateMonthlyFees,
  setFeeStatus,
  monthStart,
} from "@/lib/platform/marketplaceFee";

export interface FeeActionResult {
  ok: boolean;
  error?: string;
}

async function authFee(): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await getPlatformAdmin();
  if (!admin) return { ok: false, error: "অনুমতি নেই।" };
  const role = await getPlatformRole(admin.userId);
  if (role !== null && role !== "super_admin" && role !== "accountant") {
    return { ok: false, error: "শুধু super-admin/accountant ফি পরিচালনা করতে পারেন।" };
  }
  return { ok: true };
}

const PERIOD_RE = /^\d{4}-\d{2}(-\d{2})?$/;

const SetFeeInput = z.object({
  tenantId: z.string().uuid(),
  amount: z.coerce.number().min(0).max(10_000_000),
});

export async function setMonthlyFeeAction(raw: unknown): Promise<FeeActionResult> {
  const auth = await authFee();
  if (!auth.ok) return auth;
  const parsed = SetFeeInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "অবৈধ ইনপুট।" };
  await setMonthlyFee(parsed.data.tenantId, parsed.data.amount);
  revalidatePath("/platform/marketplace-fees");
  return { ok: true };
}

export async function generateFeesAction(period: string): Promise<FeeActionResult> {
  const auth = await authFee();
  if (!auth.ok) return auth;
  if (!PERIOD_RE.test(period)) return { ok: false, error: "অবৈধ মাস।" };
  await generateMonthlyFees(monthStart(period));
  revalidatePath("/platform/marketplace-fees");
  return { ok: true };
}

const StatusInput = z.object({
  feeId: z.string().uuid(),
  status: z.enum(["pending", "paid", "waived"]),
});

export async function setFeeStatusAction(raw: unknown): Promise<FeeActionResult> {
  const auth = await authFee();
  if (!auth.ok) return auth;
  const parsed = StatusInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "অবৈধ অনুরোধ।" };
  await setFeeStatus(parsed.data.feeId, parsed.data.status);
  revalidatePath("/platform/marketplace-fees");
  return { ok: true };
}
