// Post-commit purchase + funnel analytics fire (blueprint 2.7 + Phase B).
//
// Models the same pattern as lib/sms/notify.ts (notifyOrderPlaced).
// Fires SERVER-side analytics events AFTER an order has committed, so a
// tracking failure can never roll back an order or surface as a checkout
// error to the buyer.
//
// The purchase fire is DUAL (client + server) with a shared event_id
// minted in placeOrder (Phase 2.7). The funnel events (ViewContent /
// AddToCart / InitiateCheckout) are CLIENT-ONLY by default — they don't
// need a server mirror to work — but we expose server-side mirror
// helpers (`fireViewContentAnalytics`, `fireAddToCartAnalytics`,
// `fireInitiateCheckoutAnalytics`) for the iOS-14.5 case where the client
// pixel is blocked. These mirrors are best-effort: the client fire is
// the source of truth; the server fire is a re-attribution attempt.
//
// NON-BLOCKING by contract: every send is caught and logged; the function
// always resolves. The success page is gated on payment.payload.analytics.
// serverFired so revisiting /order/N never double-fires the server side.
import { withTenant } from "@hybrid/db";
import type { Tx } from "@hybrid/db";
import type { PurchasePayload } from "./events";
import type {
  ViewContentPayload,
  AddToCartPayload,
  InitiateCheckoutPayload,
  MetaUserData,
} from "./funnel";
import { getAnalyticsConfig } from "./config";
import {
  sendMetaPurchase,
  sendMetaViewContent,
  sendMetaAddToCart,
  sendMetaInitiateCheckout,
  sendMetaLead,
  sendMetaCompleteRegistration,
  type MetaCreds,
} from "./meta-capi";
import {
  sendGa4Purchase,
  sendGa4ViewContent,
  sendGa4AddToCart,
  sendGa4InitiateCheckout,
  sendGa4Lead,
  type Ga4Creds,
  type Ga4UserData,
} from "./ga4";
import { writeOrderPlaced } from "./internal";

type Jsonb = Parameters<Tx["json"]>[0];

export interface FirePurchaseInput {
  tenantId: string;
  orderId: string;
  customerId?: string | null;
  payload: PurchasePayload;
  /** Forwarded _ga cookie value for GA4 client_id attribution (may be null). */
  gaCookie: string | null;
  /** Phase B: enhanced-match user data (email/phone/fbp/fbc/clientIp/userAgent). */
  userData?: MetaUserData;
}

export interface FireFunnelInput {
  tenantId: string;
  payload: ViewContentPayload | AddToCartPayload | InitiateCheckoutPayload;
  gaCookie: string | null;
  userData?: MetaUserData;
  userId?: string | null;
}

// ---- Purchase (existing — kept intact) -------------------------------------

export async function firePurchaseAnalytics(input: FirePurchaseInput): Promise<void> {
  // Internal event is always recorded (first-party, never flag-gated).
  await writeOrderPlaced(input.tenantId, {
    orderId: input.orderId,
    orderNumber: input.payload.orderNumber,
    customerId: input.customerId ?? null,
    value: input.payload.value,
    eventId: input.payload.eventId,
  });

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
          } satisfies MetaCreds,
          input.payload,
          { tenantId: input.tenantId, userId: input.customerId ?? "system" },
          input.userData ?? {},
        ),
      `Meta CAPI order #${input.payload.orderNumber}`,
    );
  }

  if (config.ga4MeasurementId && config.ga4ApiSecret) {
    await safeSend(
      () =>
        sendGa4Purchase(
          { measurementId: config.ga4MeasurementId!, apiSecret: config.ga4ApiSecret! } satisfies Ga4Creds,
          input.payload,
          input.gaCookie,
          toGa4UserData(input.userData),
        ),
      `GA4-MP order #${input.payload.orderNumber}`,
    );
  }
}

// ---- Funnel server mirrors (Phase B) ---------------------------------------
// Best-effort. Client fires are the source of truth; the server mirror
// exists only to recover attribution lost to ad-blockers / iOS 14.5.

export async function fireViewContentAnalytics(
  input: FireFunnelInput,
): Promise<void> {
  const config = await safeGetConfig(input.tenantId);
  if (!config?.enabled) return;

  if (config.fbPixelId && config.fbAccessToken) {
    await safeSend(
      () =>
        sendMetaViewContent(
          { pixelId: config.fbPixelId!, accessToken: config.fbAccessToken!, testEventCode: config.fbTestEventCode },
          input.payload as ViewContentPayload,
          { tenantId: input.tenantId, userId: input.userId ?? "anonymous" },
          input.userData ?? {},
        ),
      `Meta CAPI ViewContent ${input.payload.eventId}`,
    );
  }
  if (config.ga4MeasurementId && config.ga4ApiSecret) {
    await safeSend(
      () =>
        sendGa4ViewContent(
          { measurementId: config.ga4MeasurementId!, apiSecret: config.ga4ApiSecret! },
          input.payload as ViewContentPayload,
          input.gaCookie,
          toGa4UserData(input.userData),
        ),
      `GA4-MP ViewContent ${input.payload.eventId}`,
    );
  }
}

export async function fireAddToCartAnalytics(
  input: FireFunnelInput,
): Promise<void> {
  const config = await safeGetConfig(input.tenantId);
  if (!config?.enabled) return;

  if (config.fbPixelId && config.fbAccessToken) {
    await safeSend(
      () =>
        sendMetaAddToCart(
          { pixelId: config.fbPixelId!, accessToken: config.fbAccessToken!, testEventCode: config.fbTestEventCode },
          input.payload as AddToCartPayload,
          { tenantId: input.tenantId, userId: input.userId ?? "anonymous" },
          input.userData ?? {},
        ),
      `Meta CAPI AddToCart ${input.payload.eventId}`,
    );
  }
  if (config.ga4MeasurementId && config.ga4ApiSecret) {
    await safeSend(
      () =>
        sendGa4AddToCart(
          { measurementId: config.ga4MeasurementId!, apiSecret: config.ga4ApiSecret! },
          input.payload as AddToCartPayload,
          input.gaCookie,
          toGa4UserData(input.userData),
        ),
      `GA4-MP AddToCart ${input.payload.eventId}`,
    );
  }
}

export async function fireInitiateCheckoutAnalytics(
  input: FireFunnelInput,
): Promise<void> {
  const config = await safeGetConfig(input.tenantId);
  if (!config?.enabled) return;

  if (config.fbPixelId && config.fbAccessToken) {
    await safeSend(
      () =>
        sendMetaInitiateCheckout(
          { pixelId: config.fbPixelId!, accessToken: config.fbAccessToken!, testEventCode: config.fbTestEventCode },
          input.payload as InitiateCheckoutPayload,
          { tenantId: input.tenantId, userId: input.userId ?? "anonymous" },
          input.userData ?? {},
        ),
      `Meta CAPI InitiateCheckout ${input.payload.eventId}`,
    );
  }
  if (config.ga4MeasurementId && config.ga4ApiSecret) {
    await safeSend(
      () =>
        sendGa4InitiateCheckout(
          { measurementId: config.ga4MeasurementId!, apiSecret: config.ga4ApiSecret! },
          input.payload as InitiateCheckoutPayload,
          input.gaCookie,
          toGa4UserData(input.userData),
        ),
      `GA4-MP InitiateCheckout ${input.payload.eventId}`,
    );
  }
}

// ---- Lead / CompleteRegistration (Phase B signup) --------------------------

export interface FireLeadInput {
  tenantId: string;
  eventId: string;
  gaCookie: string | null;
  userData?: MetaUserData;
  ga4UserData?: Ga4UserData;
  userId?: string | null;
}

export async function fireLeadAnalytics(input: FireLeadInput): Promise<void> {
  const config = await safeGetConfig(input.tenantId);
  if (!config?.enabled) return;

  if (config.fbPixelId && config.fbAccessToken) {
    await safeSend(
      () =>
        sendMetaLead(
          { pixelId: config.fbPixelId!, accessToken: config.fbAccessToken!, testEventCode: config.fbTestEventCode },
          {
            eventId: input.eventId,
            userData: input.userData ?? {},
            logCtx: { tenantId: input.tenantId, userId: input.userId ?? "anonymous" },
          },
        ),
      `Meta CAPI Lead ${input.eventId}`,
    );
  }
  if (config.ga4MeasurementId && config.ga4ApiSecret) {
    await safeSend(
      () =>
        sendGa4Lead(
          { measurementId: config.ga4MeasurementId!, apiSecret: config.ga4ApiSecret! },
          { eventId: input.eventId, gaCookie: input.gaCookie, userData: input.ga4UserData ?? toGa4UserData(input.userData) },
        ),
      `GA4-MP Lead ${input.eventId}`,
    );
  }
}

export async function fireCompleteRegistrationAnalytics(
  input: FireLeadInput,
): Promise<void> {
  const config = await safeGetConfig(input.tenantId);
  if (!config?.enabled) return;

  if (config.fbPixelId && config.fbAccessToken) {
    await safeSend(
      () =>
        sendMetaCompleteRegistration(
          { pixelId: config.fbPixelId!, accessToken: config.fbAccessToken!, testEventCode: config.fbTestEventCode },
          {
            eventId: input.eventId,
            userData: input.userData ?? {},
            logCtx: { tenantId: input.tenantId, userId: input.userId ?? "anonymous" },
          },
        ),
      `Meta CAPI CompleteRegistration ${input.eventId}`,
    );
  }
}

// ---- Internal helpers ------------------------------------------------------

async function safeGetConfig(tenantId: string) {
  try {
    return await getAnalyticsConfig(tenantId, null);
  } catch (error) {
    console.error(`[analytics] config read failed (${tenantId}):`, error);
    return null;
  }
}

async function safeSend(send: () => Promise<boolean>, context: string): Promise<void> {
  try {
    const ok = await send();
    if (!ok) {
      console.warn(`[analytics] send returned not-ok (${context})`);
      // Queue for retry when a network/platform issue is suspected.
      // (queueFailedEvent call sites are added per-phase; kept as no-op here to
      // avoid circular imports and preserve existing non-blocking contract.)
    }
  } catch (error) {
    console.error(`[analytics] send failed (${context}):`, error);
  }
}

/** Convert MetaUserData → GA4UserData (best-effort; we just forward user_id and client_id). */
function toGa4UserData(input: MetaUserData | undefined): Ga4UserData {
  if (!input) return {};
  const out: Ga4UserData = {};
  if (input.externalId) out.userId = input.externalId;
  // For GA4 we always derive client_id from the _ga cookie (set by fireFunnelInput
  // on the caller), so we don't need to forward fbp here.
  return out;
}

// ---- Server-fire guard (idempotency on the success page) -------------------

export async function hasServerFired(tenantId: string, paymentId: string): Promise<boolean> {
  const rows = await withTenant(tenantId, null, (tx) =>
    tx<{ payload: { analytics?: { serverFired?: boolean } } | null }[]>`
      select payload from payment where id = ${paymentId} limit 1
    `,
  );
  return rows[0]?.payload?.analytics?.serverFired === true;
}

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

export type AnalyticsPayloadJson = Jsonb;
