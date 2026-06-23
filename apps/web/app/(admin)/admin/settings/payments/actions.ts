"use server";

// Payment settings Server Actions (blueprint S-SETTINGS 1.10; DESIGN §P6).
//
//   * saveBkash   — enable/configure bKash Tokenized Checkout. The four secrets
//                   (username, password, appKey, appSecret) + mode are sealed via
//                   sealCredentials and upserted into payment_account.credentials.
//                   Secrets are NEVER echoed back; the form only sends NEW values
//                   when the seller types them, and a blank field keeps the
//                   already-sealed value (so re-saving "enabled" doesn't wipe keys).
//   * toggleCod   — COD enable/disable (market default on; no credentials).
//
// Every action authenticates (getSession) + authorizes (membership → tenant),
// writes via withTenant (RLS), and revalidates the storefront identity so the
// checkout's available rails reflect the change.
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

// The accepted argument type of postgres.js tx.json(). SealedSecret is a sealed
// JSON envelope; cast to this so the jsonb write typechecks (an interface lacks
// the index signature JSONValue requires, but the value is plain JSON).
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

function bustSettings(tenantId: string): void {
  // Storefront checkout reads which rails are enabled; identity/products tag is
  // the storefront's cache (lib/storefront/data.ts tags tenant:{id}).
  revalidateTag(`tenant:${tenantId}`);
  revalidateTag(`tenant:${tenantId}:settings`);
}

// ---- bKash -----------------------------------------------------------------
// Secrets are optional on the wire: an empty field means "unchanged". We merge
// new values over the previously-sealed map so a re-save without re-typing the
// app_secret keeps it. min(1) is enforced post-merge (config requires all four).
const BkashInput = z.object({
  enabled: z.coerce.boolean().default(false),
  mode: z.enum(["sandbox", "live"]).default("sandbox"),
  username: z.string().trim().max(200).optional().default(""),
  password: z.string().trim().max(200).optional().default(""),
  appKey: z.string().trim().max(200).optional().default(""),
  appSecret: z.string().trim().max(300).optional().default(""),
});

function readSealed(credentials: unknown): Record<string, string> {
  if (!isSealed(credentials)) return {};
  try {
    return openCredentials(credentials);
  } catch {
    return {};
  }
}

export async function saveBkash(
  _prev: SettingsResult | null,
  formData: FormData,
): Promise<SettingsResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = BkashInput.safeParse({
    enabled: formData.get("enabled") === "on" || formData.get("enabled") === "true",
    mode: formData.get("mode") ?? "sandbox",
    username: formData.get("username") ?? "",
    password: formData.get("password") ?? "",
    appKey: formData.get("appKey") ?? "",
    appSecret: formData.get("appSecret") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  }
  const input = parsed.data;

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      const existing = await tx<{ credentials: unknown }[]>`
        select credentials from payment_account where provider = 'bkash' limit 1
      `;
      const prev = readSealed(existing[0]?.credentials);

      // Merge: keep prior secret when the field came in blank (unchanged).
      const merged = {
        mode: input.mode,
        username: input.username || prev.username || "",
        password: input.password || prev.password || "",
        appKey: input.appKey || prev.appKey || "",
        appSecret: input.appSecret || prev.appSecret || "",
      };

      // Enabling requires all four credentials present (post-merge).
      if (input.enabled && (!merged.username || !merged.password || !merged.appKey || !merged.appSecret)) {
        throw new Error("INCOMPLETE_BKASH");
      }

      const sealed = sealCredentials(merged);
      await tx`
        insert into payment_account (tenant_id, provider, is_enabled, credentials)
        values (${auth.tenantId}, 'bkash', ${input.enabled}, ${tx.json(sealed as unknown as Jsonb)})
        on conflict (tenant_id, provider) do update
          set is_enabled = ${input.enabled},
              credentials = ${tx.json(sealed as unknown as Jsonb)},
              updated_at = now()
      `;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INCOMPLETE_BKASH") {
      return { ok: false, error: "বিকাশ চালু করতে সব তথ্য (ইউজারনেম, পাসওয়ার্ড, app_key, app_secret) দিন।" };
    }
    console.error("[saveBkash] failed", error);
    return { ok: false, error: "সেভ ব্যর্থ হয়েছে।" };
  }

  bustSettings(auth.tenantId);
  return { ok: true };
}

// ---- COD -------------------------------------------------------------------
const CodInput = z.object({ enabled: z.coerce.boolean() });

export async function toggleCod(
  _prev: SettingsResult | null,
  formData: FormData,
): Promise<SettingsResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = CodInput.safeParse({
    enabled: formData.get("enabled") === "on" || formData.get("enabled") === "true",
  });
  if (!parsed.success) return { ok: false, error: "ইনপুট ভুল।" };

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      // COD has no credentials — empty sealed map keeps the column shape uniform.
      await tx`
        insert into payment_account (tenant_id, provider, is_enabled, credentials)
        values (${auth.tenantId}, 'cod', ${parsed.data.enabled}, '{}'::jsonb)
        on conflict (tenant_id, provider) do update
          set is_enabled = ${parsed.data.enabled}, updated_at = now()
      `;
    });
  } catch (error) {
    console.error("[toggleCod] failed", error);
    return { ok: false, error: "সেভ ব্যর্থ হয়েছে।" };
  }

  bustSettings(auth.tenantId);
  return { ok: true };
}
