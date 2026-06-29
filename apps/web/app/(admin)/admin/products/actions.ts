"use server";

// Catalog Server Actions (blueprint S-CATALOG 1.2). Every action authenticates
// (getSession) and authorizes (membership → tenant), then mutates via withTenant
// (RLS) and revalidates the tenant:{id}:products / :product:{id} / :collections
// / :dashboard cache tags. Slug uniqueness is enforced by the DB
// product_tenant_slug / collection_tenant_slug unique constraints, caught here
// and surfaced as a friendly Bengali error.
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { withTenant } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getBlobStore, BlobValidationError } from "@/lib/storage";
import { slugify } from "@/lib/admin/format";
import { syncMarketplaceListing } from "@/lib/marketplace/sync";
import { checkPlanLimit } from "@/lib/platform/plans";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// Resolve session + tenant once per action. Returns a friendly error envelope
// rather than throwing so forms can render it.
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

function bustProductTags(tenantId: string, productId?: string): void {
  revalidateTag(`tenant:${tenantId}`);
  revalidateTag(`tenant:${tenantId}:products`);
  revalidateTag(`tenant:${tenantId}:dashboard`);
  if (productId) {
    revalidateTag(`tenant:${tenantId}:product:${productId}`);
    // Project the change into the world-readable marketplace catalog. Best-effort
    // (sync swallows its own errors); the marketplace-sync cron is the safety net.
    void syncMarketplaceListing(tenantId, productId);
  }
}

// Postgres unique-violation code. The slug unique constraint surfaces as 23505.
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

// ---- Variant matrix shape (posted as JSON from the client form) ------------
const OptionSchema = z.object({
  name: z.string().trim().min(1).max(50),
  values: z.array(z.string().trim().min(1).max(50)).max(50),
});

const VariantSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().max(120).nullable().default(null),
  sku: z.string().trim().max(80).nullable().default(null),
  price: z.coerce.number().min(0).max(10_000_000),
  inventory: z.coerce.number().int().min(0).max(1_000_000),
  options: z.record(z.string()).default({}),
  isActive: z.boolean().default(true),
});

const ProductWriteSchema = z.object({
  title: z.string().trim().min(1, "নাম দিন").max(200),
  description: z.string().trim().max(5000).optional().default(""),
  status: z.enum(["active", "draft", "archived"]),
  options: z.array(OptionSchema).max(3).default([]),
  variants: z.array(VariantSchema).min(1, "অন্তত একটি ভ্যারিয়েন্ট দিন").max(100),
  imageUrls: z.array(z.string().max(500)).max(20).default([]),
  collectionIds: z.array(z.string().uuid()).max(50).default([]),
  marketplaceHidden: z.boolean().default(false),
});

// ---- Create ----------------------------------------------------------------
export async function createProduct(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = ProductWriteSchema.safeParse(readProductForm(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  }
  const input = parsed.data;

  // Enforce plan product limit before inserting.
  const productLimit = await checkPlanLimit(auth.tenantId, "product");
  if (!productLimit.allowed) {
    const msg = productLimit.limit === null
      ? "পণ্য সীমা অতিক্রম হয়েছে।"
      : `আপনার প্ল্যানে সর্বোচ্চ ${productLimit.limit}টি পণ্য রাখা যায় (বর্তমান: ${productLimit.used})। আপগ্রেড করুন।`;
    return { ok: false, error: msg };
  }

  const slug = slugify(input.title);

  let newProductId: string;
  try {
    newProductId = await withTenant(auth.tenantId, auth.userId, async (tx) => {
      const rows = await tx<{ id: string }[]>`
        insert into product (tenant_id, title, slug, description, status, options, marketplace_hidden)
        values (${auth.tenantId}, ${input.title}, ${slug}, ${input.description},
                ${input.status}::product_status, ${tx.json(input.options)}, ${input.marketplaceHidden})
        returning id
      `;
      const productId = rows[0]!.id;
      await writeVariants(tx, auth.tenantId, productId, input.variants);
      await writeImages(tx, auth.tenantId, productId, input.imageUrls);
      await writeCollections(tx, auth.tenantId, productId, input.collectionIds);
      return productId;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "এই নামে একটি পণ্য আগে থেকেই আছে।" };
    }
    console.error("[createProduct] failed", error);
    return { ok: false, error: "পণ্য তৈরি ব্যর্থ হয়েছে।" };
  }

  bustProductTags(auth.tenantId, newProductId);
  redirect(`/admin/products/${newProductId}/edit`);
}

// ---- Update ----------------------------------------------------------------
export async function updateProduct(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const productId = z.string().uuid().safeParse(formData.get("productId"));
  if (!productId.success) return { ok: false, error: "পণ্য পাওয়া যায়নি।" };

  const parsed = ProductWriteSchema.safeParse(readProductForm(formData));
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
               options = ${tx.json(input.options)},
               marketplace_hidden = ${input.marketplaceHidden}, updated_at = now()
         where id = ${productId.data}
      `;
      // Replace variants: upsert provided, deactivate orphans (don't hard-delete
      // — order_item.variant_id references them with ON DELETE SET NULL, but
      // keeping rows preserves SKU history and is safer for inventory).
      await writeVariants(tx, auth.tenantId, productId.data, input.variants);
      await replaceImages(tx, auth.tenantId, productId.data, input.imageUrls);
      await replaceCollections(tx, auth.tenantId, productId.data, input.collectionIds);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "একই SKU বা নাম অন্য পণ্যে ব্যবহৃত হয়েছে।" };
    }
    console.error("[updateProduct] failed", error);
    return { ok: false, error: "সেভ ব্যর্থ হয়েছে।" };
  }

  bustProductTags(auth.tenantId, productId.data);
  return { ok: true };
}

// ---- Delete ----------------------------------------------------------------
export async function deleteProduct(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;
  const productId = z.string().uuid().safeParse(formData.get("productId"));
  if (!productId.success) return { ok: false, error: "পণ্য পাওয়া যায়নি।" };

  await withTenant(auth.tenantId, auth.userId, async (tx) => {
    // Cascades drop variants/images/product_collection rows.
    await tx`delete from product where id = ${productId.data}`;
  });

  bustProductTags(auth.tenantId, productId.data);
  redirect("/admin/products");
}

// ---- Image upload (called from the client form before save) ----------------
export interface UploadResult {
  ok: boolean;
  url?: string;
  error?: string;
}

export async function uploadProductImage(formData: FormData): Promise<UploadResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "ফাইল পাওয়া যায়নি।" };

  try {
    const store = await getBlobStore();
    const { url } = await store.put({
      tenantId: auth.tenantId,
      bytes: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type,
      originalName: file.name,
    });
    return { ok: true, url };
  } catch (error) {
    if (error instanceof BlobValidationError) return { ok: false, error: error.message };
    console.error("[uploadProductImage] failed", error);
    return { ok: false, error: "আপলোড ব্যর্থ হয়েছে।" };
  }
}

// ---- Collections -----------------------------------------------------------
const CollectionSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "কালেকশনের নাম দিন").max(120),
  description: z.string().trim().max(2000).optional().default(""),
  productIds: z.array(z.string().uuid()).max(500).default([]),
});

export async function saveCollection(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = CollectionSchema.safeParse({
    id: formData.get("id") || undefined,
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    productIds: readJsonArray(formData.get("productIds")),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  }
  const input = parsed.data;
  const slug = slugify(input.title);

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      let collectionId = input.id;
      if (collectionId) {
        await tx`
          update collection set title = ${input.title}, description = ${input.description}, updated_at = now()
          where id = ${collectionId}
        `;
      } else {
        const rows = await tx<{ id: string }[]>`
          insert into collection (tenant_id, title, slug, description)
          values (${auth.tenantId}, ${input.title}, ${slug}, ${input.description})
          returning id
        `;
        collectionId = rows[0]!.id;
      }
      await tx`delete from product_collection where collection_id = ${collectionId}`;
      for (const pid of input.productIds) {
        await tx`
          insert into product_collection (tenant_id, product_id, collection_id)
          values (${auth.tenantId}, ${pid}, ${collectionId})
          on conflict do nothing
        `;
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "এই নামে একটি কালেকশন আগে থেকেই আছে।" };
    }
    console.error("[saveCollection] failed", error);
    return { ok: false, error: "কালেকশন সেভ ব্যর্থ হয়েছে।" };
  }

  revalidateTag(`tenant:${auth.tenantId}:collections`);
  revalidateTag(`tenant:${auth.tenantId}:products`);
  return { ok: true };
}

export async function deleteCollection(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "কালেকশন পাওয়া যায়নি।" };

  await withTenant(auth.tenantId, auth.userId, async (tx) => {
    await tx`delete from collection where id = ${id.data}`;
  });
  revalidateTag(`tenant:${auth.tenantId}:collections`);
  redirect("/admin/collections");
}

// ---- internal write helpers ------------------------------------------------
type Tx = Parameters<Parameters<typeof withTenant>[2]>[0];

function readProductForm(formData: FormData) {
  return {
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    status: formData.get("status"),
    options: readJsonArray(formData.get("options")),
    variants: readJsonArray(formData.get("variants")),
    imageUrls: readJsonArray(formData.get("imageUrls")),
    collectionIds: readJsonArray(formData.get("collectionIds")),
    marketplaceHidden: formData.get("marketplaceHidden") === "on",
  };
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

async function writeVariants(
  tx: Tx,
  tenantId: string,
  productId: string,
  variants: z.infer<typeof VariantSchema>[],
): Promise<void> {
  const keptIds: string[] = [];
  let position = 0;
  for (const v of variants) {
    const title = v.title || variantTitleFromOptions(v.options);
    if (v.id) {
      await tx`
        update product_variant
           set title = ${title}, sku = ${v.sku}, price = ${v.price},
               inventory_quantity = ${v.inventory}, options = ${tx.json(v.options)},
               is_active = ${v.isActive}, position = ${position}, updated_at = now()
         where id = ${v.id} and product_id = ${productId}
      `;
      keptIds.push(v.id);
    } else {
      const rows = await tx<{ id: string }[]>`
        insert into product_variant
          (tenant_id, product_id, title, sku, price, inventory_quantity, options, is_active, position)
        values (${tenantId}, ${productId}, ${title}, ${v.sku}, ${v.price},
                ${v.inventory}, ${tx.json(v.options)}, ${v.isActive}, ${position})
        returning id
      `;
      keptIds.push(rows[0]!.id);
    }
    position += 1;
  }
  // Deactivate variants no longer in the matrix (keep the row for history).
  if (keptIds.length > 0) {
    await tx`
      update product_variant set is_active = false, updated_at = now()
      where product_id = ${productId} and id not in ${tx(keptIds)}
    `;
  }
}

function variantTitleFromOptions(options: Record<string, string>): string {
  const parts = Object.values(options).filter(Boolean);
  return parts.length ? parts.join(" / ") : "Default";
}

async function writeImages(
  tx: Tx,
  tenantId: string,
  productId: string,
  urls: string[],
): Promise<void> {
  let position = 0;
  for (const url of urls) {
    await tx`
      insert into product_image (tenant_id, product_id, url, position)
      values (${tenantId}, ${productId}, ${url}, ${position})
    `;
    position += 1;
  }
}

// Replace the image set with the provided (already-uploaded) URLs in order.
// Simplest correct approach for P1: clear and re-insert. URLs are opaque blob
// refs; reordering is just a new position sequence (DESIGN §P4 reorder).
async function replaceImages(
  tx: Tx,
  tenantId: string,
  productId: string,
  urls: string[],
): Promise<void> {
  await tx`delete from product_image where product_id = ${productId}`;
  await writeImages(tx, tenantId, productId, urls);
}

async function writeCollections(
  tx: Tx,
  tenantId: string,
  productId: string,
  collectionIds: string[],
): Promise<void> {
  for (const cid of collectionIds) {
    await tx`
      insert into product_collection (tenant_id, product_id, collection_id)
      values (${tenantId}, ${productId}, ${cid}) on conflict do nothing
    `;
  }
}

async function replaceCollections(
  tx: Tx,
  tenantId: string,
  productId: string,
  collectionIds: string[],
): Promise<void> {
  await tx`delete from product_collection where product_id = ${productId}`;
  await writeCollections(tx, tenantId, productId, collectionIds);
}
