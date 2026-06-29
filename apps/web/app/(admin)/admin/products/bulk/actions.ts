"use server";

// Bulk product editor Server Actions — set status / adjust prices for many
// products at once. Tenant-scoped via the catalog data layer; busts the product
// cache tags and re-syncs the marketplace projection for every touched product.
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { bulkSetProductStatus, bulkAdjustVariantPrices } from "@/lib/admin/catalog";
import { syncMarketplaceListing } from "@/lib/marketplace/sync";

export interface BulkActionResult {
  ok: boolean;
  error?: string;
  changed?: number;
}

async function auth(): Promise<
  | { ok: true; tenantId: string; userId: string }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  return { ok: true, tenantId, userId: session.userId };
}

function bust(tenantId: string, productIds: string[]): void {
  revalidateTag(`tenant:${tenantId}`);
  revalidateTag(`tenant:${tenantId}:products`);
  revalidateTag(`tenant:${tenantId}:dashboard`);
  for (const id of productIds) {
    revalidateTag(`tenant:${tenantId}:product:${id}`);
    // Re-project to the marketplace (best-effort, never throws).
    void syncMarketplaceListing(tenantId, id);
  }
}

const StatusInput = z.object({
  ids: z.array(z.string().uuid()).min(1, "অন্তত একটি পণ্য বেছে নিন।").max(500),
  status: z.enum(["active", "draft", "archived"]),
});

export async function bulkSetStatusAction(raw: unknown): Promise<BulkActionResult> {
  const a = await auth();
  if (!a.ok) return a;
  const parsed = StatusInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };

  const changed = await bulkSetProductStatus(a.tenantId, a.userId, parsed.data.ids, parsed.data.status);
  bust(a.tenantId, changed);
  return { ok: true, changed: changed.length };
}

const PriceInput = z.object({
  ids: z.array(z.string().uuid()).min(1, "অন্তত একটি পণ্য বেছে নিন।").max(500),
  // Guardrail: never wipe prices or 10x them by accident.
  percent: z.coerce.number().min(-90).max(900),
});

export async function bulkAdjustPricesAction(raw: unknown): Promise<BulkActionResult> {
  const a = await auth();
  if (!a.ok) return a;
  const parsed = PriceInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  if (parsed.data.percent === 0) return { ok: false, error: "শতাংশ ০ হতে পারে না।" };

  const changed = await bulkAdjustVariantPrices(a.tenantId, a.userId, parsed.data.ids, parsed.data.percent);
  bust(a.tenantId, changed);
  return { ok: true, changed: changed.length };
}
