"use server";

// Platform billing Server Actions (PP1-A3). Guarded by getPlatformAdmin (only a
// super-admin reaches these). Manual overrides + a billing-sweep trigger.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getPlatformAdmin } from "@/lib/platform/auth";
import { extendTrial, markInvoicePaid } from "@/lib/platform/billing";
import { runBillingSweep } from "@/lib/billing/sweep";
import { bustTenantDomainCache } from "@/lib/platform/cache";

export interface PlatformActionResult {
  ok: boolean;
  error?: string;
  swept?: number;
}

export async function extendTrialAction(tenantId: string, days: number): Promise<PlatformActionResult> {
  if (!(await getPlatformAdmin())) return { ok: false, error: "অনুমতি নেই।" };
  const t = z.string().uuid().safeParse(tenantId);
  const d = z.coerce.number().int().min(1).max(365).safeParse(days);
  if (!t.success || !d.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  await extendTrial(t.data, d.data);
  revalidatePath("/platform/billing");
  return { ok: true };
}

export async function markInvoicePaidAction(invoiceId: string): Promise<PlatformActionResult> {
  if (!(await getPlatformAdmin())) return { ok: false, error: "অনুমতি নেই।" };
  const i = z.string().uuid().safeParse(invoiceId);
  if (!i.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  await markInvoicePaid(i.data);
  revalidatePath("/platform/billing");
  return { ok: true };
}

export async function runSweepAction(): Promise<PlatformActionResult> {
  if (!(await getPlatformAdmin())) return { ok: false, error: "অনুমতি নেই।" };
  try {
    const result = await runBillingSweep(new Date(), bustTenantDomainCache);
    revalidatePath("/platform/billing");
    revalidatePath("/platform");
    return { ok: true, swept: result.suspended.length + result.pastDue.length };
  } catch {
    return { ok: false, error: "সুইপ ব্যর্থ হয়েছে।" };
  }
}
