"use server";
import { getTenantContextBySlug } from "@/lib/storefront/data";
import { writeCartAdded } from "@/lib/analytics/internal";

export async function trackCartAddedAction(
  tenantSlug: string,
  args: {
    productId: string;
    productSlug: string;
    variantId: string;
    title: string;
    price: number;
    qty: number;
  },
): Promise<void> {
  const ctx = await getTenantContextBySlug(tenantSlug);
  if (!ctx) return;
  void writeCartAdded(ctx.id, args).catch(() => null);
}
