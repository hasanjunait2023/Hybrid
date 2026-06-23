"use server";

// Store profile Server Action (blueprint S-SETTINGS 1.10; DESIGN §P6).
//
// saveStoreProfile — store name, hotline phone, Facebook, address, return policy
// and VAT/BIN. Name writes to tenant.name; the rest merge into the tenant.settings
// jsonb (no secrets here → no encryption). Revalidates the storefront identity
// tag (tenant:{id}) so the public store header/footer pick up the new name/phone/
// social immediately (lib/storefront/data.ts reads these from tenant.settings).
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { withTenant } from "@hybrid/db";
import type { Tx } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";

// Accepted arg type of tx.json(); cast the settings object to it for the write.
type Jsonb = Parameters<Tx["json"]>[0];

export interface SettingsResult {
  ok: boolean;
  error?: string;
}

async function authTenant(): Promise<
  { ok: true; tenantId: string; userId: string } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  return { ok: true, tenantId, userId: session.userId };
}

const StoreInput = z.object({
  name: z.string().trim().min(1, "দোকানের নাম দিন").max(120),
  phone: z.string().trim().max(20).optional().default(""),
  facebook: z.string().trim().max(300).optional().default(""),
  address: z.string().trim().max(500).optional().default(""),
  returnPolicy: z.string().trim().max(2000).optional().default(""),
  vatBin: z.string().trim().max(60).optional().default(""),
});

interface TenantSettingsJson {
  contact?: { phone?: string; address?: string };
  social?: { facebook?: string };
  policies?: { returns?: string };
  vatBin?: string;
  [key: string]: unknown;
}

export async function saveStoreProfile(
  _prev: SettingsResult | null,
  formData: FormData,
): Promise<SettingsResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = StoreInput.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") ?? "",
    facebook: formData.get("facebook") ?? "",
    address: formData.get("address") ?? "",
    returnPolicy: formData.get("returnPolicy") ?? "",
    vatBin: formData.get("vatBin") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  }
  const input = parsed.data;

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      // Read-merge-write the settings jsonb so unrelated keys (theme, etc.) are
      // preserved; only the profile sub-objects are overwritten.
      const rows = await tx<{ settings: TenantSettingsJson }[]>`
        select settings from tenant where id = ${auth.tenantId} limit 1
      `;
      const current = rows[0]?.settings ?? {};
      const next: TenantSettingsJson = {
        ...current,
        contact: { ...current.contact, phone: input.phone, address: input.address },
        social: { ...current.social, facebook: input.facebook },
        policies: { ...current.policies, returns: input.returnPolicy },
        vatBin: input.vatBin,
      };

      await tx`
        update tenant
           set name = ${input.name}, settings = ${tx.json(next as unknown as Jsonb)}, updated_at = now()
         where id = ${auth.tenantId}
      `;
    });
  } catch (error) {
    console.error("[saveStoreProfile] failed", error);
    return { ok: false, error: "সেভ ব্যর্থ হয়েছে।" };
  }

  // Storefront identity (name/phone/social) lives behind tenant:{id} (and the
  // theme tag); bust both so the public store reflects the change.
  revalidateTag(`tenant:${auth.tenantId}`);
  revalidateTag(`tenant:${auth.tenantId}:theme`);
  revalidateTag(`tenant:${auth.tenantId}:settings`);
  return { ok: true };
}
