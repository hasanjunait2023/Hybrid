"use server";

// Shipping & delivery settings action. Auth + RLS via the shipping data layer;
// the storefront calculator (lib/commerce/shipping.ts) reads the same rows.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { saveShippingSettings, type SaveShippingInput } from "@/lib/admin/shipping";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";

export interface ShippingActionResult {
  ok: boolean;
  error?: string;
}

const Input = z.object({
  enabled: z.boolean(),
  originDivision: z.string().nullable(),
  originDistrict: z.string().nullable(),
  freeAbove: z.number().min(0).nullable(),
  defaultRate: z.number().min(0),
  rates: z.array(
    z.object({
      zone: z.enum(["same_district", "same_division", "other_division"]),
      base: z.number().min(0),
      perKg: z.number().min(0),
    }),
  ),
});

export async function saveShippingSettingsAction(
  input: SaveShippingInput,
): Promise<ShippingActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "অবৈধ ইনপুট।" };

  await saveShippingSettings(tenantId, session.userId, parsed.data);
  revalidatePath("/admin/settings/shipping");
  return { ok: true };
}
