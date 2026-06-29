"use server";

// CRM automation Server Actions — create / pause / delete / run-now (Phase R1.4).
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import {
  createJourney,
  toggleJourney,
  deleteJourney,
} from "@/lib/admin/journeys";
import { runJourneysForTenant } from "@/lib/crm/runJourneys";

export interface JourneyActionResult {
  ok: boolean;
  error?: string;
  sent?: number;
  failed?: number;
}

async function auth(): Promise<
  | { ok: true; tenantId: string; userId: string }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  return { ok: true, tenantId, userId: session.userId };
}

const CreateInput = z.object({
  name: z.string().trim().min(1, "নাম দিন।").max(120),
  trigger: z.enum(["review_request", "win_back", "repeat_buyer"]),
  message: z.string().trim().min(1, "মেসেজ দিন।").max(640),
  thresholdDays: z.coerce.number().int().min(0).max(3650).optional().default(0),
  minOrders: z.coerce.number().int().min(0).max(100000).optional().default(0),
});

export async function createJourneyAction(raw: unknown): Promise<JourneyActionResult> {
  const a = await auth();
  if (!a.ok) return a;
  const parsed = CreateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };

  await createJourney(a.tenantId, a.userId, {
    name: parsed.data.name,
    trigger: parsed.data.trigger,
    message: parsed.data.message,
    thresholdDays: parsed.data.thresholdDays,
    minOrders: parsed.data.minOrders,
  });
  revalidatePath("/admin/automations");
  return { ok: true };
}

export async function toggleJourneyAction(id: string, active: boolean): Promise<JourneyActionResult> {
  const a = await auth();
  if (!a.ok) return a;
  const uid = z.string().uuid().safeParse(id);
  if (!uid.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  await toggleJourney(a.tenantId, a.userId, uid.data, active);
  revalidatePath("/admin/automations");
  return { ok: true };
}

export async function deleteJourneyAction(id: string): Promise<JourneyActionResult> {
  const a = await auth();
  if (!a.ok) return a;
  const uid = z.string().uuid().safeParse(id);
  if (!uid.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  await deleteJourney(a.tenantId, a.userId, uid.data);
  revalidatePath("/admin/automations");
  return { ok: true };
}

// Manual trigger — evaluate this tenant's active journeys right now. Sends are
// gated by the SMS adapter (log-only until SMS_LIVE=1) and idempotent.
export async function runNowAction(): Promise<JourneyActionResult> {
  const a = await auth();
  if (!a.ok) return a;
  const res = await runJourneysForTenant(a.tenantId, a.userId);
  revalidatePath("/admin/automations");
  return { ok: true, sent: res.sent, failed: res.failed };
}
