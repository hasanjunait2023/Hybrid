// Post-commit purchase analytics fire (blueprint 2.7), modeled exactly on
// lib/sms/notify.ts (notifyOrderPlaced). Fires the SERVER half of the deduped
// purchase event AFTER the order transaction has committed:
//
//   1. Meta CAPI Purchase   (flag-gated CAPI_ENABLED)   — shared event_id
//   2. GA4 Measurement Protocol purchase (flag-gated GA4_ENABLED) — _ga client_id
//   3. analytics_event order.placed (always, first-party, tenant-scoped)
//
// NON-BLOCKING by contract: a gateway/DB failure here must never roll back an
// order that already committed, and must never surface as a checkout error to the
// buyer. Every send is caught and logged; the function always resolves. The
// client Pixel + gtag (storefront island) fire the BROWSER half with the SAME
// event_id — Meta/GA4 dedup the two so the conversion counts once.
//
// The shared event_id is minted in placeOrder and stored in payment.payload
// (audit). To keep the order success page from re-firing the server half on every
// "track my order" revisit, the first fire stamps payload.analytics.serverFired —
// callers gate on it (see markServerFired / hasServerFired).
import { withTenant } from "@hybrid/db";
import type { Tx } from "@hybrid/db";
import type { PurchasePayload } from "./events";
import { getAnalyticsConfig } from "./config";
import { sendMetaPurchase } from "./meta-capi";
import { sendGa4Purchase } from "./ga4";
import { writeOrderPlaced } from "./internal";

type Jsonb = Parameters<Tx["json"]>[0];

export interface FirePurchaseInput {
  tenantId: string;
  orderId: string;
  customerId?: string | null;
  payload: PurchasePayload;
  /** Forwarded _ga cookie value for GA4 client_id attribution (may be null). */
  gaCookie: string | null;
}

// Fire-and-await the server half of the purchase event, swallowing per-send
// errors. Awaited (not detached) so a serverless invocation doesn't terminate
// mid-send, but failures are isolated: one send failing never blocks the others
// or the caller. Always resolves.
export async function firePurchaseAnalytics(input: FirePurchaseInput): Promise<void> {
  // Internal event is always recorded (first-party, never flag-gated).
  await writeOrderPlaced(input.tenantId, {
    orderId: input.orderId,
    orderNumber: input.payload.orderNumber,
    customerId: input.customerId ?? null,
    value: input.payload.value,
    eventId: input.payload.eventId,
  });

  // External fires need the sealed secrets; read them once.
  let config;
  try {
    config = await getAnalyticsConfig(input.tenantId, null);
  } catch (error) {
    console.error(`[analytics] config read failed (order #${input.payload.orderNumber}):`, error);
    return;
  }
  if (!config.enabled) return;

  if (config.fbPixelId && config.fbAccessToken) {
    await safeSend(
      () =>
        sendMetaPurchase(
          {
            pixelId: config.fbPixelId!,
            accessToken: config.fbAccessToken!,
            testEventCode: config.fbTestEventCode,
          },
          input.payload,
          { tenantId: input.tenantId, userId: input.customerId ?? "system" },
        ),
      `Meta CAPI order #${input.payload.orderNumber}`,
    );
  }

  if (config.ga4MeasurementId && config.ga4ApiSecret) {
    await safeSend(
      () =>
        sendGa4Purchase(
          { measurementId: config.ga4MeasurementId!, apiSecret: config.ga4ApiSecret! },
          input.payload,
          input.gaCookie,
        ),
      `GA4-MP order #${input.payload.orderNumber}`,
    );
  }
}

async function safeSend(send: () => Promise<boolean>, context: string): Promise<void> {
  try {
    const ok = await send();
    if (!ok) console.warn(`[analytics] send returned not-ok (${context})`);
  } catch (error) {
    console.error(`[analytics] send failed (${context}):`, error);
  }
}

// ---- Server-fire guard (idempotency on the success page) -------------------
// The order success page is the server trigger point for the purchase fire. It
// renders on every "track my order" visit, so we stamp payment.payload once and
// gate on it: read hasServerFired → if false, fire + markServerFired. Concurrent
// double-render is harmless (Meta/GA4 dedup on event_id; the worst case is a
// duplicate suppressed by the platforms).

export async function hasServerFired(tenantId: string, paymentId: string): Promise<boolean> {
  const rows = await withTenant(tenantId, null, (tx) =>
    tx<{ payload: { analytics?: { serverFired?: boolean } } | null }[]>`
      select payload from payment where id = ${paymentId} limit 1
    `,
  );
  return rows[0]?.payload?.analytics?.serverFired === true;
}

// Stamp payload.analytics.serverFired = true (merging, not clobbering, the
// existing payload jsonb). Best-effort; a failure just means a possible re-fire
// which the platforms dedup.
export async function markServerFired(tenantId: string, paymentId: string): Promise<void> {
  try {
    await withTenant(tenantId, null, (tx) =>
      tx`
        update payment
           set payload = jsonb_set(
                 coalesce(payload, '{}'::jsonb),
                 '{analytics,serverFired}',
                 'true'::jsonb,
                 true
               ),
               updated_at = now()
         where id = ${paymentId}
      `,
    );
  } catch (error) {
    console.error(`[analytics] markServerFired failed (payment ${paymentId}):`, error);
  }
}

// Read the stored shared event_id from payment.payload (set in placeOrder). The
// success page needs it for BOTH the client Pixel eventID and the server fire so
// the two sides share the dedup key. Returns null when absent.
export async function readAnalyticsEventId(
  tenantId: string,
  paymentId: string,
): Promise<string | null> {
  const rows = await withTenant(tenantId, null, (tx) =>
    tx<{ payload: { analytics?: { eventId?: string } } | null }[]>`
      select payload from payment where id = ${paymentId} limit 1
    `,
  );
  const id = rows[0]?.payload?.analytics?.eventId;
  return typeof id === "string" && id ? id : null;
}

// Cast helper kept local so notify.ts owns the only place that writes the
// analytics jsonb shape outside placeOrder.
export type AnalyticsPayloadJson = Jsonb;
