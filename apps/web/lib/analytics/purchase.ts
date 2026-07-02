// Order-success purchase orchestration (blueprint 2.7). The storefront order
// success page is the server trigger for the deduped `purchase` fire. Given a
// committed order (resolved by number + phone, same gate as the success view),
// this:
//
//   1. Loads the order's payment row (for the stored shared event_id + paymentId)
//      and its items — all via withTenant (RLS).
//   2. Fires the SERVER half (CAPI + GA4-MP + internal order.placed) ONCE, gated
//      on payment.payload.analytics.serverFired so revisiting /order/N never
//      double-fires the server side.
//   3. Returns the PUBLIC purchase payload + the tenant's public IDs so the page
//      can render the client island that fires the BROWSER half (Pixel + gtag)
//      with the SAME event_id.
//
// Secrets never reach the client: getPublicAnalyticsIds reads only plaintext IDs;
// the sealed secrets are opened only inside firePurchaseAnalytics (server-side).
import { withTenant } from "@hybrid/db";
import type { PurchasePayload } from "./events";
import { getPublicAnalyticsIds, type PublicAnalyticsIds } from "./config";
import {
  firePurchaseAnalytics,
  hasServerFired,
  markServerFired,
} from "./notify";
import type { MetaUserData } from "@/lib/analytics/funnel";

export interface ClientPurchaseFire {
  publicIds: PublicAnalyticsIds;
  payload: PurchasePayload;
}

interface OrderForPurchase {
  orderId: string;
  paymentId: string;
  customerId: string | null;
  grandTotal: number;
  eventId: string | null;
  items: { id: string; name: string; price: number; quantity: number }[];
}

// Resolve the order + its latest payment + items for the purchase event. Phone-
// gated identically to getStorefrontOrder (no buyer account → phone is the token).
async function loadOrderForPurchase(
  tenantId: string,
  orderNumber: number,
  normalizedPhone: string,
): Promise<OrderForPurchase | null> {
  return withTenant(tenantId, null, async (tx) => {
    const orders = await tx<
      {
        id: string;
        customer_id: string | null;
        grand_total: string;
        customer_phone: string | null;
      }[]
    >`
      select id, customer_id, grand_total, customer_phone
        from orders where order_number = ${orderNumber} limit 1
    `;
    const order = orders[0];
    if (!order) return null;
    // Phone gate (digits compared by the caller's normalize).
    if (normalizePhone(order.customer_phone ?? "") !== normalizedPhone) return null;

    const payments = await tx<
      { id: string; payload: { analytics?: { eventId?: string } } | null }[]
    >`
      select id, payload from payment where order_id = ${order.id}
       order by created_at desc limit 1
    `;
    const payment = payments[0];
    if (!payment) return null;

    const items = await tx<
      { product_id: string; title: string; unit_price: string; quantity: number }[]
    >`
      select product_id, title, unit_price, quantity
        from order_item where order_id = ${order.id}
    `;

    const eventId = payment.payload?.analytics?.eventId;
    return {
      orderId: order.id,
      paymentId: payment.id,
      customerId: order.customer_id,
      grandTotal: Number(order.grand_total),
      eventId: typeof eventId === "string" && eventId ? eventId : null,
      items: items.map((i) => ({
        id: i.product_id,
        name: i.title,
        price: Number(i.unit_price),
        quantity: i.quantity,
      })),
    } satisfies OrderForPurchase;
  });
}

// Prepare (and, on first visit, fire the server half of) the purchase event for
// a confirmed order. Returns the client-fire bundle, or null when there is no
// event_id to dedup on (e.g. an order placed before analytics shipped) or the
// order/phone doesn't resolve. Never throws — analytics must not break the page.
export async function preparePurchaseFire(
  tenantId: string,
  orderNumber: number,
  phone: string,
  gaCookie: string | null,
  enhancedMatch?: {
    userAgent?: string | null;
    clientIp?: string | null;
    fbp?: string | null;
    fbc?: string | null;
  },
): Promise<(ClientPurchaseFire & { userData: MetaUserData }) | null> {
  try {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return null;

    const order = await loadOrderForPurchase(tenantId, orderNumber, normalizedPhone);
    if (!order || !order.eventId) return null;

    const payload: PurchasePayload = {
      eventId: order.eventId,
      orderNumber,
      value: order.grandTotal,
      currency: "BDT",
      items: order.items,
    };

    const userData: MetaUserData = {
      fbp: enhancedMatch?.fbp ?? null,
      fbc: enhancedMatch?.fbc ?? null,
      clientIp: enhancedMatch?.clientIp ?? null,
      userAgent: enhancedMatch?.userAgent ?? null,
      phone: normalizedPhone,
      externalId: order.customerId,
    };

    // Fire the server half once (gated). Awaited but internally non-blocking.
    const alreadyFired = await hasServerFired(tenantId, order.paymentId);
    if (!alreadyFired) {
      await markServerFired(tenantId, order.paymentId);
      await firePurchaseAnalytics({
        tenantId,
        orderId: order.orderId,
        customerId: order.customerId,
        payload,
        gaCookie,
        userData,
      });
    }

    const publicIds = await getPublicAnalyticsIds(tenantId, null);
    if (!publicIds.enabled) return null;

    // TRACK-V2-A1: surface the TikTok Pixel ID alongside GA4 + Meta so the
    // PurchaseTracker client island can fire ttq.track('CompletePayment', ...)
    // with the same shared event_id.
    return {
      publicIds: {
        ga4MeasurementId: publicIds.ga4MeasurementId,
        fbPixelId: publicIds.fbPixelId,
        tiktokPixelId: publicIds.tiktokPixelId,
      },
      payload,
      userData,
    };
  } catch (error) {
    console.error(`[analytics] preparePurchaseFire failed (order #${orderNumber}):`, error);
    return null;
  }
}

// Normalize a phone...
const BN_TO_LATIN: Record<string, string> = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
};
function normalizePhone(input: string): string {
  return input.replace(/[০-৯]/g, (d) => BN_TO_LATIN[d] ?? d).replace(/[^\d]/g, "");
}
