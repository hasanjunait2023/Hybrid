"use server";

// Loyalty program settings action (P3-2). Auth + RLS via the loyalty data layer.
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { updateProgram } from "@/lib/admin/loyalty";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";

export interface LoyaltyActionResult {
  ok: boolean;
  error?: string;
}

const Input = z.object({
  enabled: z.boolean(),
  earnPer100: z.coerce.number().int().min(0).max(1000),
  takaPerPoint: z.coerce.number().min(0).max(1000),
});

export async function updateLoyaltyAction(
  enabled: boolean,
  earnPer100: number,
  takaPerPoint: number,
): Promise<LoyaltyActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };

  const parsed = Input.safeParse({ enabled, earnPer100, takaPerPoint });
  if (!parsed.success) return { ok: false, error: "অবৈধ ইনপুট।" };

  await updateProgram(tenantId, session.userId, parsed.data);
  revalidateTag(`tenant:${tenantId}:loyalty`);
  return { ok: true };
}
