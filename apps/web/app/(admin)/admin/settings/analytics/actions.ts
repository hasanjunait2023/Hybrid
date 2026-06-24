"use server";

// Analytics settings Server Action (blueprint 2.7; DESIGN §Q4). GA4 + Meta
// Pixel/CAPI per-tenant config.
//
//   PUBLIC (plaintext):  ga4MeasurementId, fbPixelId, fbTestEventCode
//   SECRET (sealed):     ga4ApiSecret, fbAccessToken
//
// The two secrets are sealed AES-256-GCM into ONE envelope under
// tenant.settings.analytics.credentials; the public IDs sit alongside in
// plaintext. Secrets are write-masked: a blank secret field on save keeps the
// previously-sealed value (so re-saving "enabled" never wipes a key). Enabling
// requires at least one provider fully configured (a public ID + its secret).
//
// Authenticates (getSession) + authorizes (membership → tenant) + writes via
// withTenant (RLS). No storefront cache tag to bust — the public IDs are read
// fresh by the order success page (uncached) and admin reads are not cached.
import { z } from "zod";
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

const AnalyticsInput = z.object({
  enabled: z.coerce.boolean().default(false),
  ga4MeasurementId: z.string().trim().max(50).optional().default(""),
  ga4ApiSecret: z.string().trim().max(200).optional().default(""),
  fbPixelId: z.string().trim().max(50).optional().default(""),
  fbAccessToken: z.string().trim().max(500).optional().default(""),
  fbTestEventCode: z.string().trim().max(50).optional().default(""),
});

export async function saveAnalytics(
  _prev: SettingsResult | null,
  formData: FormData,
): Promise<SettingsResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = AnalyticsInput.safeParse({
    enabled: formData.get("enabled") === "on" || formData.get("enabled") === "true",
    ga4MeasurementId: formData.get("ga4MeasurementId") ?? "",
    ga4ApiSecret: formData.get("ga4ApiSecret") ?? "",
    fbPixelId: formData.get("fbPixelId") ?? "",
    fbAccessToken: formData.get("fbAccessToken") ?? "",
    fbTestEventCode: formData.get("fbTestEventCode") ?? "",
  });
  if (!parsed.success) return { ok: false, error: "ইনপুট ভুল।" };
  const input = parsed.data;

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      const rows = await tx<{ settings: Record<string, unknown> }[]>`
        select settings from tenant where id = ${auth.tenantId} limit 1
      `;
      const settings = (rows[0]?.settings ?? {}) as Record<string, unknown>;
      const analytics = (settings.analytics ?? {}) as { credentials?: unknown };
      const prev = readSealed(analytics.credentials);

      // Merge secrets: keep prior value when the field came in blank (unchanged).
      const ga4ApiSecret = input.ga4ApiSecret || prev.ga4ApiSecret || "";
      const fbAccessToken = input.fbAccessToken || prev.fbAccessToken || "";

      // Enabling requires at least one provider fully wired (public ID + secret).
      const ga4Ready = Boolean(input.ga4MeasurementId) && Boolean(ga4ApiSecret);
      const fbReady = Boolean(input.fbPixelId) && Boolean(fbAccessToken);
      if (input.enabled && !ga4Ready && !fbReady) {
        throw new Error("INCOMPLETE_ANALYTICS");
      }

      const sealed = sealCredentials({ ga4ApiSecret, fbAccessToken });
      const nextSettings = {
        ...settings,
        analytics: {
          enabled: input.enabled,
          ga4MeasurementId: input.ga4MeasurementId,
          fbPixelId: input.fbPixelId,
          fbTestEventCode: input.fbTestEventCode,
          credentials: sealed,
        },
      };
      await tx`
        update tenant set settings = ${tx.json(nextSettings as unknown as Jsonb)}, updated_at = now()
        where id = ${auth.tenantId}
      `;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INCOMPLETE_ANALYTICS") {
      return {
        ok: false,
        error: "চালু করতে অন্তত একটি প্রোভাইডার পূর্ণ করুন (GA4: Measurement ID + API Secret, অথবা Meta: Pixel ID + Access Token)।",
      };
    }
    console.error("[saveAnalytics] failed", error);
    return { ok: false, error: "সেভ ব্যর্থ হয়েছে।" };
  }

  return { ok: true };
}
