"use server";
// One-click post-checkout upsell action (Phase 4 multi-step funnel). After a
// COD order is confirmed, the buyer sees a special offer. If they accept, this
// action places a NEW order for just the upsell product (linked to the original
// via note) using the same delivery details. The buyer doesn't have to re-enter
// anything — their phone + the original order number carry the context.
import { z } from "zod";
import { getTenantContextBySlug } from "@/lib/storefront/data";
import { getPublishedLandingPage } from "@/lib/admin/landingPages";
import { placeOrder } from "@/lib/commerce/placeOrder";
import { withTenant } from "@hybrid/db";

const upsellSchema = z.object({
  tenantSlug: z.string().min(1),
  lpSlug: z.string().min(1),
  originalOrderNumber: z.number().int().positive(),
  phone: z.string().min(6).max(20),
});

export type UpsellResult =
  | { ok: true; orderNumber: number }
  | { ok: false; error: string };

export async function acceptUpsellAction(raw: unknown): Promise<UpsellResult> {
  const parsed = upsellSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "তথ্য সঠিক নয়।" };

  const { tenantSlug, lpSlug, originalOrderNumber, phone } = parsed.data;

  const ctx = await getTenantContextBySlug(tenantSlug);
  if (!ctx) return { ok: false, error: "স্টোর পাওয়া যায়নি।" };

  const lp = await getPublishedLandingPage(ctx.id, null, lpSlug);
  const upsell = lp?.funnelConfig.post_checkout_upsell;
  if (!upsell?.variant_id || !upsell.price) {
    return { ok: false, error: "অফারটি আর পাওয়া যাচ্ছে না।" };
  }

  // Fetch the original order for shipping address + customer name — so the buyer
  // doesn't have to re-enter anything.
  const origRows = await withTenant(ctx.id, null, (tx) =>
    tx<{
      customer_name: string | null;
      customer_phone: string | null;
      shipping_division: string;
      shipping_district: string;
      shipping_thana: string;
      shipping_line: string;
    }[]>`
      select customer_name, customer_phone,
             shipping_division, shipping_district, shipping_thana, shipping_line
      from orders
      where order_number = ${originalOrderNumber}
        and customer_phone = ${phone}
      limit 1
    `,
  );
  const orig = origRows[0];
  if (!orig) return { ok: false, error: "মূল অর্ডার পাওয়া যায়নি।" };

  let placed;
  try {
    placed = await placeOrder({
      tenantId: ctx.id,
      userId: null,
      customer: {
        phone: orig.customer_phone ?? phone,
        name: orig.customer_name ?? "",
      },
      shippingAddress: {
        recipient: orig.customer_name ?? "",
        phone: orig.customer_phone ?? phone,
        division: orig.shipping_division,
        district: orig.shipping_district,
        thana: orig.shipping_thana,
        line: orig.shipping_line,
      },
      items: [{ variantId: upsell.variant_id, quantity: 1 }],
      paymentMethod: "cod",
      note: `আপসেল অর্ডার — মূল অর্ডার #${originalOrderNumber}`,
      source: "storefront",
      discountCode: null,
      shippingTotal: 0,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_STOCK") {
      return { ok: false, error: "দুঃখিত, পণ্যটির স্টক শেষ।" };
    }
    console.error("[upsell] placeOrder failed:", err);
    return { ok: false, error: "অর্ডার তৈরি করা যায়নি।" };
  }

  return { ok: true, orderNumber: placed.orderNumber };
}
