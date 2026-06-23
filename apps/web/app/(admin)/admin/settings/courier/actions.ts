"use server";

// Courier settings Server Actions (blueprint S-SETTINGS 1.10; DESIGN §P6).
//
// saveSteadfast — enable/configure the Steadfast courier account. The Api-Key /
// Secret-Key pair is sealed via sealCredentials and upserted into
// courier_account.credentials. Secrets are NEVER echoed back; a blank field on
// re-save keeps the previously-sealed value.
//
// Honest note (rendered on the page, not here): Steadfast has NO sandbox, so
// live courier requires a real merchant account (brief §2). Until then the
// adapter is contract-tested only.
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

// Accepted arg type of tx.json(); cast the sealed envelope to it for the write.
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

const SteadfastInput = z.object({
  enabled: z.coerce.boolean().default(false),
  apiKey: z.string().trim().max(300).optional().default(""),
  secretKey: z.string().trim().max(300).optional().default(""),
});

export async function saveSteadfast(
  _prev: SettingsResult | null,
  formData: FormData,
): Promise<SettingsResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = SteadfastInput.safeParse({
    enabled: formData.get("enabled") === "on" || formData.get("enabled") === "true",
    apiKey: formData.get("apiKey") ?? "",
    secretKey: formData.get("secretKey") ?? "",
  });
  if (!parsed.success) return { ok: false, error: "ইনপুট ভুল।" };
  const input = parsed.data;

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      const existing = await tx<{ credentials: unknown }[]>`
        select credentials from courier_account where provider = 'steadfast' limit 1
      `;
      const prev = readSealed(existing[0]?.credentials);

      const merged = {
        apiKey: input.apiKey || prev.apiKey || "",
        secretKey: input.secretKey || prev.secretKey || "",
      };

      if (input.enabled && (!merged.apiKey || !merged.secretKey)) {
        throw new Error("INCOMPLETE_STEADFAST");
      }

      const sealed = sealCredentials(merged);
      await tx`
        insert into courier_account (tenant_id, provider, is_enabled, credentials)
        values (${auth.tenantId}, 'steadfast', ${input.enabled}, ${tx.json(sealed as unknown as Jsonb)})
        on conflict (tenant_id, provider) do update
          set is_enabled = ${input.enabled},
              credentials = ${tx.json(sealed as unknown as Jsonb)},
              updated_at = now()
      `;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INCOMPLETE_STEADFAST") {
      return { ok: false, error: "কুরিয়ার চালু করতে Api-Key এবং Secret-Key দিন।" };
    }
    console.error("[saveSteadfast] failed", error);
    return { ok: false, error: "সেভ ব্যর্থ হয়েছে।" };
  }

  revalidateTag(`tenant:${auth.tenantId}:settings`);
  return { ok: true };
}
