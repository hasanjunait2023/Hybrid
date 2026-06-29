"use server";

// Wholesale product Server Actions. Every action authenticates, authorizes,
// then mutates via withTenant (RLS) and revalidates cache tags.
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { withTenant } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { slugify } from "@/lib/admin/format";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function authTenant(): Promise<
  | { ok: true; tenantId: string; userId: string }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  return { ok: true, tenantId, userId: session.userId };
}

function bustTags(tenantId: string, productId?: string): void {
  revalidateTag(`tenant:${tenantId}`);
  revalidateTag(`tenant:${tenantId}:wholesale:products`);
  if (productId) {
    revalidateTag(`tenant:${tenantId}:wholesale:product:${productId}`);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

const TierPriceSchema = z.object({
  minQty: z.coerce.number().int().min(1),
  price: z.coerce.number().min(0),
});

const WholesaleProductWriteSchema = z.object({
  title: z.string().trim().min(1, "নাম দিন").max(200),
  description: z.string().trim().max(5000).optional().default(""),
  status: z.enum(["active", "draft", "archived"]),
  isWholesale: z.boolean().default(true),
  wholesaleOnly: z.boolean().default(false),
  moq: z.coerce.number().int().min(0).optional().default(0),
  wholesalePrice: z.coerce.number().min(0).optional().default(0),
  tierPrices: z.array(TierPriceSchema).max(10).default([]),
});

export async function createWholesaleProduct(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = WholesaleProductWriteSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    status: formData.get("status"),
    isWholesale: formData.get("isWholesale") === "on",
    wholesaleOnly: formData.get("wholesaleOnly") === "on",
    moq: formData.get("moq") || 0,
    wholesalePrice: formData.get("wholesalePrice") || 0,
    tierPrices: readJsonArray(formData.get("tierPrices")),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  }
  const input = parsed.data;
  const slug = slugify(input.title);

  let newProductId: string;
  try {
    newProductId = await withTenant(auth.tenantId, auth.userId, async (tx) => {
      const rows = await tx<{ id: string }[]>`
        insert into product (tenant_id, title, slug, description, status,
                             is_wholesale, wholesale_only, moq)
        values (${auth.tenantId}, ${input.title}, ${slug}, ${input.description},
                ${input.status}::product_status,
                ${input.isWholesale}, ${input.wholesaleOnly},
                ${input.moq > 0 ? input.moq : null})
        returning id
      `;
      const productId = rows[0]!.id;

      // Create a default variant with wholesale price and tier prices
      await tx`
        insert into product_variant (tenant_id, product_id, title, price, wholesale_price,
                                     tier_prices, inventory_quantity, is_active, position)
        values (${auth.tenantId}, ${productId}, 'Default', ${input.wholesalePrice || 0},
                ${input.wholesalePrice > 0 ? input.wholesalePrice : null},
                ${tx.json(input.tierPrices)}, 0, true, 0)
      `;
      return productId;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "এই নামে একটি পণ্য আগে থেকেই আছে।" };
    }
    console.error("[createWholesaleProduct] failed", error);
    return { ok: false, error: "পণ্য তৈরি ব্যর্থ হয়েছে।" };
  }

  bustTags(auth.tenantId, newProductId);
  redirect("/admin/wholesale/products");
}

export async function updateWholesaleProduct(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const productId = z.string().uuid().safeParse(formData.get("productId"));
  if (!productId.success) return { ok: false, error: "পণ্য পাওয়া যায়নি।" };

  const parsed = WholesaleProductWriteSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    status: formData.get("status"),
    isWholesale: formData.get("isWholesale") === "on",
    wholesaleOnly: formData.get("wholesaleOnly") === "on",
    moq: formData.get("moq") || 0,
    wholesalePrice: formData.get("wholesalePrice") || 0,
    tierPrices: readJsonArray(formData.get("tierPrices")),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  }
  const input = parsed.data;

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      await tx`
        update product
           set title = ${input.title}, description = ${input.description},
               status = ${input.status}::product_status,
               is_wholesale = ${input.isWholesale},
               wholesale_only = ${input.wholesaleOnly},
               moq = ${input.moq > 0 ? input.moq : null},
               updated_at = now()
         where id = ${productId.data}
      `;
      // Update the default variant's wholesale price and tier prices
      const variants = await tx<{ id: string }[]>`
        select id from product_variant
        where product_id = ${productId.data}
        order by position asc limit 1
      `;
      if (variants[0]) {
        await tx`
          update product_variant
             set wholesale_price = ${input.wholesalePrice > 0 ? input.wholesalePrice : null},
                 tier_prices = ${tx.json(input.tierPrices)},
                 updated_at = now()
           where id = ${variants[0].id}
        `;
      }
    });
  } catch (error) {
    console.error("[updateWholesaleProduct] failed", error);
    return { ok: false, error: "সেভ ব্যর্থ হয়েছে।" };
  }

  bustTags(auth.tenantId, productId.data);
  return { ok: true };
}

export async function deleteWholesaleProduct(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;
  const productId = z.string().uuid().safeParse(formData.get("productId"));
  if (!productId.success) return { ok: false, error: "পণ্য পাওয়া যায়নি।" };

  await withTenant(auth.tenantId, auth.userId, async (tx) => {
    await tx`delete from product where id = ${productId.data}`;
  });

  bustTags(auth.tenantId, productId.data);
  redirect("/admin/wholesale/products");
}

function readJsonArray(value: FormDataEntryValue | null): unknown[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
