"use server";

// Notification settings Server Actions (blueprint SHIFT 2; DESIGN §Q4). The
// tenant pastes its OWN sms.net.bd api_key for customer notifications; the
// platform key (env) stays for signup OTP. The api_key is sealed AES-256-GCM and
// stored in tenant.settings.notifications.sms (jsonb, RLS-protected). senderId is
// a non-secret label and stays plaintext alongside the sealed envelope.
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { withTenant, sealCredentials, openCredentials, isSealed } from "@hybrid/db";
import type { Tx } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";

export interface SettingsResult {
  ok: boolean;
  error?: string;
}

type Jsonb = Parameters<Tx["json"]>[0];

async function authTenant(): Promise<
  { ok: true; tenantId: string; userId: string } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  return { ok: true, tenantId, userId: session.userId };
}

function readSealed(credentials: unknown): Record<string, string> {
  if (!isSealed(credentials)) return {};
  try {
    return openCredentials(credentials);
  } catch {
    return {};
  }
}

const SmsInput = z.object({
  enabled: z.coerce.boolean().default(false),
  apiKey: z.string().trim().max(300).optional().default(""),
  senderId: z.string().trim().max(50).optional().default(""),
});

export async function saveSms(
  _prev: SettingsResult | null,
  formData: FormData,
): Promise<SettingsResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = SmsInput.safeParse({
    enabled: formData.get("enabled") === "on" || formData.get("enabled") === "true",
    apiKey: formData.get("apiKey") ?? "",
    senderId: formData.get("senderId") ?? "",
  });
  if (!parsed.success) return { ok: false, error: "ইনপুট ভুল।" };
  const input = parsed.data;

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      const rows = await tx<{ settings: Record<string, unknown> }[]>`
        select settings from tenant where id = ${auth.tenantId} limit 1
      `;
      const settings = (rows[0]?.settings ?? {}) as Record<string, unknown>;
      const notifications = (settings.notifications ?? {}) as Record<string, unknown>;
      const sms = (notifications.sms ?? {}) as { credentials?: unknown };

      const prev = readSealed(sms.credentials);
      const apiKey = input.apiKey || prev.apiKey || "";
      if (input.enabled && !apiKey) throw new Error("INCOMPLETE_SMS");

      const sealed = sealCredentials({ apiKey });
      const nextSettings = {
        ...settings,
        notifications: {
          ...notifications,
          sms: { enabled: input.enabled, senderId: input.senderId, credentials: sealed },
        },
      };
      await tx`
        update tenant set settings = ${tx.json(nextSettings as unknown as Jsonb)}, updated_at = now()
        where id = ${auth.tenantId}
      `;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INCOMPLETE_SMS") {
      return { ok: false, error: "SMS চালু করতে api_key দিন।" };
    }
    console.error("[saveSms] failed", error);
    return { ok: false, error: "সেভ ব্যর্থ হয়েছে।" };
  }

  revalidateTag(`tenant:${auth.tenantId}:settings`);
  return { ok: true };
}
