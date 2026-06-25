"use server";

// Marketing campaign Server Actions (P2-4). Auth + RLS via the marketing data
// layer. createCampaign records a draft + recipient count; sendCampaign fires
// the gated SMS broadcast and records the outcome.
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { createCampaign, sendCampaign } from "@/lib/admin/marketing";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";

export interface CampaignActionResult {
  ok: boolean;
  error?: string;
  id?: string;
  recipientCount?: number;
  sent?: number;
  live?: boolean;
}

async function auth(): Promise<
  { ok: true; tenantId: string; userId: string } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  return { ok: true, tenantId, userId: session.userId };
}

const CreateInput = z.object({
  message: z.string().trim().min(1, "মেসেজ লিখুন").max(600),
  audience: z.enum(["all", "repeat"]),
});

export async function createCampaignAction(message: string, audience: string): Promise<CampaignActionResult> {
  const a = await auth();
  if (!a.ok) return a;
  const parsed = CreateInput.safeParse({ message, audience });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "অবৈধ ইনপুট।" };
  const res = await createCampaign(a.tenantId, a.userId, {
    channel: "sms",
    audience: parsed.data.audience,
    message: parsed.data.message,
  });
  revalidateTag(`tenant:${a.tenantId}:campaigns`);
  return { ok: true, id: res.id, recipientCount: res.recipientCount };
}

export async function sendCampaignAction(campaignId: string): Promise<CampaignActionResult> {
  const a = await auth();
  if (!a.ok) return a;
  const id = z.string().uuid().safeParse(campaignId);
  if (!id.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  try {
    const res = await sendCampaign(a.tenantId, a.userId, id.data);
    revalidateTag(`tenant:${a.tenantId}:campaigns`);
    return { ok: true, sent: res.sent, live: res.live };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "ALREADY_SENT") return { ok: false, error: "এই ক্যাম্পেইন পাঠানো হয়ে গেছে।" };
    if (msg === "CAMPAIGN_NOT_FOUND") return { ok: false, error: "ক্যাম্পেইন পাওয়া যায়নি।" };
    return { ok: false, error: "পাঠানো ব্যর্থ হয়েছে।" };
  }
}
