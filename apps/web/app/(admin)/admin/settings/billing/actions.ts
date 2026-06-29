"use server";
// Billing upgrade Server Action (tenant roadmap P3-1). Validates the tenant
// session, resolves the selected plan, calls initiateUpgrade to create a draft
// invoice + bKash payment, and returns the bKash redirect URL to the client.
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listPlans } from "@/lib/platform/plans";
import { initiateUpgrade } from "@/lib/billing/subscriptionUpgrade";
import { asPlatformAdmin } from "@hybrid/db";

const upgradeSchema = z.object({
  planId: z.string().uuid(),
  tenantPhone: z.string().min(6).max(20),
});

export type UpgradeResult =
  | { ok: true; bkashURL: string }
  | { ok: false; error: string };

export async function initiateUpgradeAction(raw: unknown): Promise<UpgradeResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "অনুগ্রহ করে লগইন করুন।" };

  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "স্টোর খুঁজে পাওয়া যায়নি।" };

  const parsed = upgradeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "তথ্য সঠিক নয়।" };

  const { planId, tenantPhone } = parsed.data;

  // Verify the plan exists and is active.
  const plans = await listPlans();
  const plan = plans.find((p) => p.id === planId && p.isActive);
  if (!plan) return { ok: false, error: "প্ল্যান পাওয়া যায়নি।" };
  if (plan.priceBdt <= 0) return { ok: false, error: "এই প্ল্যানের জন্য পেমেন্ট প্রযোজ্য নয়।" };

  const result = await initiateUpgrade({
    tenantId,
    planId: plan.id,
    planName: plan.name,
    priceBdt: plan.priceBdt,
    tenantPhone,
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, bkashURL: result.bkashURL };
}

// Resolve the tenant owner's phone for pre-filling the payer reference field.
export async function getTenantOwnerPhone(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return null;

  const rows = await asPlatformAdmin((tx) =>
    tx<{ phone: string | null }[]>`
      select u.phone from app_user u
      join tenant_member tm on tm.user_id = u.id
      where tm.tenant_id = ${tenantId} and tm.role = 'owner'
      limit 1
    `,
  );
  return rows[0]?.phone ?? null;
}
