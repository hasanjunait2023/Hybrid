// Meta Conversions API (CAPI) server fire (blueprint 2.7 + Phase B).
//
// Sends `Purchase` + the funnel events (ViewContent / AddToCart /
// InitiateCheckout) + Lead/CompleteRegistration to Meta via POST
// /v{ver}/{pixelId}/events. The client Pixel fires the matching browser
// event with the SAME event_id; Meta dedups the server CAPI event against
// the browser Pixel event on (event_name + event_id) — so the conversion
// counts once even though it fires from both sides (resilient to
// ad-blockers / iOS tracking limits).
//
// FLAG-GATED: only calls the network when CAPI_ENABLED=true (off in
// dev/test). Flag-off → returns immediately (no-op). Requires fbPixelId
// (public) + fbAccessToken (sealed). fbTestEventCode (optional) routes the
// event to Meta's Test Events tab for verification without polluting
// production data.
//
// Phase B ENHANCED MATCH: each call accepts a `userData` block (email,
// phone, fbp, fbc, client_ip, user_agent). The email + phone are SHA-256
// hashed (lowercase/trim) before going on the wire so we never put raw PII
// in the CAPI payload. The other fields (fbp, fbc, client_ip, user_agent)
// are passed through as-is per Meta's spec.
import type { PurchasePayload } from "./events";
import {
  buildMetaUserData,
  type MetaUserData,
  type FunnelEventName,
} from "./funnel";
import type { ViewContentPayload, AddToCartPayload, InitiateCheckoutPayload } from "./funnel";
import { logTrackingEvent } from "./log";

const GRAPH_VERSION = "v17.0";
const GRAPH_BASE = "https://graph.facebook.com";

export interface MetaCreds {
  pixelId: string;
  accessToken: string;
  testEventCode?: string | null;
}

interface LogCtx {
  tenantId: string;
  userId: string;
}

function capiEnabled(): boolean {
  return process.env.CAPI_ENABLED === "true";
}

/** Map our internal funnel name → Meta's PascalCase event name. */
const META_FUNNEL_NAME: Record<FunnelEventName, string> = {
  ViewContent: "ViewContent",
  AddToCart: "AddToCart",
  InitiateCheckout: "InitiateCheckout",
};

type TrackingPayload = { [key: string]: string | number | boolean | null };

// Shared event-send core. Builds the CAPI body + fires + logs.
async function sendMetaEventCore(args: {
  creds: MetaCreds;
  eventName: string;
  eventId: string;
  customData: Record<string, unknown>;
  userData: MetaUserData;
  logCtx?: LogCtx;
}): Promise<boolean> {
  if (!capiEnabled()) return false;
  if (!args.creds.pixelId || !args.creds.accessToken) return false;

  const userData = buildMetaUserData(args.userData);
  const event: Record<string, unknown> = {
    event_name: args.eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: args.eventId,
    action_source: "website",
    user_data: userData,
    custom_data: args.customData,
  };
  const body: Record<string, unknown> = { data: [event] };
  if (args.creds.testEventCode) body.test_event_code = args.creds.testEventCode;
  if (Object.keys(userData).length > 0 && args.userData.fbc) {
    event.attribution_data = { click_id: args.userData.fbc };
  }

  const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(args.creds.pixelId)}/events?access_token=${encodeURIComponent(args.creds.accessToken)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (args.logCtx) {
      await logTrackingEvent({
        tenantId: args.logCtx.tenantId,
        userId: args.logCtx.userId,
        eventId: args.eventId,
        eventName: args.eventName,
        platform: "meta",
        source: "server",
        status: res.ok ? "sent" : "failed",
        payload: { hasUserData: Object.keys(userData).length > 0 } as TrackingPayload,
        responseCode: res.status,
        responseBody: (await res.text().catch(() => "")).slice(0, 4096),
      });
    }
    if (!res.ok) {
      console.warn(`[analytics] Meta CAPI returned ${res.status} (event ${args.eventName})`);
      return false;
    }
    return true;
  } catch (error) {
    if (args.logCtx) {
      await logTrackingEvent({
        tenantId: args.logCtx.tenantId,
        userId: args.logCtx.userId,
        eventId: args.eventId,
        eventName: args.eventName,
        platform: "meta",
        source: "server",
        status: "failed",
        payload: { hasUserData: Object.keys(userData).length > 0 } as TrackingPayload,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
    console.error(`[analytics] Meta CAPI send failed (event ${args.eventName}):`, error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public send helpers
// ---------------------------------------------------------------------------

/** Fire the Purchase to Meta CAPI. Resolves true on a 2xx, false otherwise. */
export async function sendMetaPurchase(
  creds: MetaCreds,
  payload: PurchasePayload,
  logCtx?: LogCtx,
  userData: MetaUserData = {},
): Promise<boolean> {
  return sendMetaEventCore({
    creds,
    eventName: "Purchase",
    eventId: payload.eventId,
    customData: {
      currency: payload.currency,
      value: payload.value,
      order_id: String(payload.orderNumber),
      content_type: "product",
      content_ids: payload.items.map((i) => i.id),
      contents: payload.items.map((i) => ({
        id: i.id,
        quantity: i.quantity,
        item_price: i.price,
      })),
    },
    userData,
    logCtx,
  });
}

/** ViewContent CAPI fire. */
export async function sendMetaViewContent(
  creds: MetaCreds,
  payload: ViewContentPayload,
  logCtx?: LogCtx,
  userData: MetaUserData = {},
): Promise<boolean> {
  return sendMetaEventCore({
    creds,
    eventName: META_FUNNEL_NAME.ViewContent,
    eventId: payload.eventId,
    customData: {
      currency: payload.currency,
      value: payload.value,
      content_type: "product",
      content_ids: payload.items.map((i) => i.id),
      contents: payload.items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: i.price })),
    },
    userData,
    logCtx,
  });
}

/** AddToCart CAPI fire. */
export async function sendMetaAddToCart(
  creds: MetaCreds,
  payload: AddToCartPayload,
  logCtx?: LogCtx,
  userData: MetaUserData = {},
): Promise<boolean> {
  return sendMetaEventCore({
    creds,
    eventName: META_FUNNEL_NAME.AddToCart,
    eventId: payload.eventId,
    customData: {
      currency: payload.currency,
      value: payload.value,
      content_type: "product",
      content_ids: payload.items.map((i) => i.id),
      contents: payload.items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: i.price })),
    },
    userData,
    logCtx,
  });
}

/** InitiateCheckout CAPI fire. */
export async function sendMetaInitiateCheckout(
  creds: MetaCreds,
  payload: InitiateCheckoutPayload,
  logCtx?: LogCtx,
  userData: MetaUserData = {},
): Promise<boolean> {
  return sendMetaEventCore({
    creds,
    eventName: META_FUNNEL_NAME.InitiateCheckout,
    eventId: payload.eventId,
    customData: {
      currency: payload.currency,
      value: payload.value,
      content_type: "product",
      content_ids: payload.items.map((i) => i.id),
      contents: payload.items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: i.price })),
      num_items: payload.items.reduce((sum, i) => sum + i.quantity, 0),
    },
    userData,
    logCtx,
  });
}

/** Lead CAPI fire (signup / form completion). */
export async function sendMetaLead(
  creds: MetaCreds,
  args: { eventId: string; userData: MetaUserData; logCtx?: LogCtx },
): Promise<boolean> {
  return sendMetaEventCore({
    creds,
    eventName: "Lead",
    eventId: args.eventId,
    customData: {},
    userData: args.userData,
    logCtx: args.logCtx,
  });
}

/** CompleteRegistration CAPI fire (account created). */
export async function sendMetaCompleteRegistration(
  creds: MetaCreds,
  args: { eventId: string; userData: MetaUserData; logCtx?: LogCtx },
): Promise<boolean> {
  return sendMetaEventCore({
    creds,
    eventName: "CompleteRegistration",
    eventId: args.eventId,
    customData: { status: "complete" },
    userData: args.userData,
    logCtx: args.logCtx,
  });
}
