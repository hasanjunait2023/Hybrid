"use server";

import { z } from "zod";
import { revalidateTag } from "next/cache";
import { withTenant } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";

// updateProduct (blueprint §8): Zod validate → withTenant update product +
// its primary variant → revalidate the tenant's product cache tags so the
// storefront ISR surfaces refresh. The action authenticates and authorizes
// inside (never trusts the client): the session resolves the user, the user's
// membership resolves the tenant, and RLS (via withTenant) guarantees the write
// can only touch that tenant's rows.
const UpdateProductInput = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
  title: z.string().trim().min(1, "নাম দিন").max(200),
  description: z.string().trim().max(5000).optional().default(""),
  status: z.enum(["active", "draft", "archived"]),
  price: z.coerce.number().min(0, "দাম ০ বা তার বেশি হতে হবে").max(10_000_000),
  inventory: z.coerce.number().int().min(0).max(1_000_000),
});

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function updateProduct(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };

  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };

  const parsed = UpdateProductInput.safeParse({
    productId: formData.get("productId"),
    variantId: formData.get("variantId"),
    title: formData.get("title"),
    description: formData.get("description"),
    status: formData.get("status"),
    price: formData.get("price"),
    inventory: formData.get("inventory"),
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "ইনপুট ভুল।" };
  }

  const input = parsed.data;

  // RLS scopes both updates to this tenant; a productId/variantId from another
  // tenant simply matches zero rows.
  await withTenant(tenantId, session.userId, async (tx) => {
    await tx`
      update product
      set title = ${input.title},
          description = ${input.description},
          status = ${input.status}::product_status,
          updated_at = now()
      where id = ${input.productId}
    `;
    await tx`
      update product_variant
      set price = ${input.price},
          inventory_quantity = ${input.inventory},
          updated_at = now()
      where id = ${input.variantId} and product_id = ${input.productId}
    `;
  });

  revalidateTag(`tenant:${tenantId}:products`);
  revalidateTag(`tenant:${tenantId}:product:${input.productId}`);

  return { ok: true };
}
