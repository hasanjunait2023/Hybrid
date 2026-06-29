"use server";

// Wholesale settings Server Actions.
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { withTenant } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function authTenant(): Promise<
  | { ok: true; tenantId: string; userId: string }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  return { ok: true, tenantId, userId: session.userId };
}

const SettingsSchema = z.object({
  taxRate: z.coerce.number().min(0).max(100).default(0),
  paymentTerms: z.string().max(50).default("due_on_delivery"),
  deliveryDays: z.coerce.number().int().min(0).max(90).default(7),
  minOrderAmount: z.coerce.number().min(0).max(10_000_000).default(0),
});

export async function saveWholesaleSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = SettingsSchema.safeParse({
    taxRate: formData.get("taxRate") || 0,
    paymentTerms: formData.get("paymentTerms") || "due_on_delivery",
    deliveryDays: formData.get("deliveryDays") || 7,
    minOrderAmount: formData.get("minOrderAmount") || 0,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  }
  const input = parsed.data;

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      await tx`
        update tenant
           set wholesale_settings = ${tx.json({
             tax_rate: input.taxRate,
             payment_terms: input.paymentTerms,
             delivery_days: input.deliveryDays,
             min_order_amount: input.minOrderAmount,
           })}
         where id = ${auth.tenantId}
      `;
    });
  } catch (error) {
    console.error("[saveWholesaleSettings] failed", error);
    return { ok: false, error: "সেভ ব্যর্থ হয়েছে।" };
  }

  revalidateTag(`tenant:${auth.tenantId}:wholesale:settings`);
  return { ok: true };
}
