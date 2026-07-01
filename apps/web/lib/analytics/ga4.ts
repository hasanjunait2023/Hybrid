// GA4 Measurement Protocol server fire (blueprint 2.7 + Phase B).
//
// Sends the deduped `purchase` event AND the funnel events
// (view_item / add_to_cart / begin_checkout) AND `generate_lead` to GA4
// via POST /mp/collect so server-attributed conversions land even when
// the client gtag is blocked. The client gtag (storefront island) fires
// the SAME event with the SAME transaction_id; GA4 dedups on the pair
// (event name + transaction_id) the way Meta dedups on event_id.
//
// FLAG-GATED: only calls the network when GA4_ENABLED=true (off in
// dev/test). Flag-off → returns immediately (no-op). Requires
// ga4MeasurementId (public) + ga4ApiSecret (sealed). client_id is derived
// from the forwarded _ga cookie so the server hit attributes to the same
// GA client as the browser; missing cookie falls back to a synthetic id
// (GA4 records it as "(not set)" attribution).
import type { PurchasePayload } from "./events";
import type { ViewContentPayload, AddToCartPayload, InitiateCheckoutPayload } from "./funnel";

const MP_ENDPOINT = "https://www.google-analytics.com/mp/collect";

export interface Ga4Creds {
  measurementId: string;
  apiSecret: string;
}

/** Optional user_data for funnel events. We set client_id from the _ga cookie
 * (see clientIdFromGaCookie). For Lead events we can also pass user_id
 * (a customer or signup id) so GA4 joins server hits to the same user. */
export interface Ga4UserData {
  /** Override client_id (defaults to the parsed _ga cookie value). */
  clientId?: string | null;
  /** GA4 user_id — joins hits to the same signed-in user. */
  userId?: string | null;
  /** User properties to attach to the event. */
  userProperties?: Record<string, string | number | boolean>;
}

// Parse the GA4 client_id out of a forwarded _ga cookie value. The cookie
// looks like "GA1.1.1234567890.1700000000"; GA4 client_id is the last two
// dot-segments ("1234567890.1700000000"). Returns null when absent/malformed.
export function clientIdFromGaCookie(gaCookie: string | null | undefined): string | null {
  if (!gaCookie) return null;
  const parts = gaCookie.split(".");
  if (parts.length < 4) return null;
  const clientId = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  return /^\d+\.\d+$/.test(clientId) ? clientId : null;
}

function ga4Enabled(): boolean {
  return process.env.GA4_ENABLED === "true";
}

// Core send: builds the MP body and POSTs it. Returns true on a 2xx.
async function sendGa4EventCore(args: {
  creds: Ga4Creds;
  gaCookie: string | null;
  events: Array<{ name: string; params: Record<string, unknown> }>;
  userData?: Ga4UserData;
}): Promise<boolean> {
  if (!ga4Enabled()) return false;
  if (!args.creds.measurementId || !args.creds.apiSecret) return false;

  const clientId =
    args.userData?.clientId ??
    clientIdFromGaCookie(args.gaCookie) ??
    `${Date.now()}.${Math.floor(Math.random() * 1e9)}`;

  const body: Record<string, unknown> = {
    client_id: clientId,
    events: args.events,
  };
  if (args.userData?.userId) body.user_id = args.userData.userId;
  if (args.userData?.userProperties) {
    body.user_properties = Object.fromEntries(
      Object.entries(args.userData.userProperties).map(([k, v]) => [k, { value: v }]),
    );
  }

  const url = `${MP_ENDPOINT}?measurement_id=${encodeURIComponent(args.creds.measurementId)}&api_secret=${encodeURIComponent(args.creds.apiSecret)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[analytics] GA4-MP returned ${res.status} (event ${args.events[0]?.name})`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[analytics] GA4-MP send failed (event ${args.events[0]?.name}):`, error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public send helpers
// ---------------------------------------------------------------------------

/** Fire the purchase to GA4-MP. Resolves true on a 2xx, false otherwise. */
export async function sendGa4Purchase(
  creds: Ga4Creds,
  payload: PurchasePayload,
  gaCookie: string | null,
  userData: Ga4UserData = {},
): Promise<boolean> {
  return sendGa4EventCore({
    creds,
    gaCookie,
    userData,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: String(payload.orderNumber),
          currency: payload.currency,
          value: payload.value,
          items: payload.items.map((i) => ({
            item_id: i.id,
            item_name: i.name,
            price: i.price,
            quantity: i.quantity,
          })),
        },
      },
    ],
  });
}

/** view_item (ViewContent) GA4-MP fire. */
export async function sendGa4ViewContent(
  creds: Ga4Creds,
  payload: ViewContentPayload,
  gaCookie: string | null,
  userData: Ga4UserData = {},
): Promise<boolean> {
  return sendGa4EventCore({
    creds,
    gaCookie,
    userData,
    events: [
      {
        name: "view_item",
        params: {
          currency: payload.currency,
          value: payload.value,
          items: payload.items.map((i) => ({
            item_id: i.id,
            item_name: i.name,
            price: i.price,
            quantity: i.quantity,
          })),
        },
      },
    ],
  });
}

/** add_to_cart GA4-MP fire. */
export async function sendGa4AddToCart(
  creds: Ga4Creds,
  payload: AddToCartPayload,
  gaCookie: string | null,
  userData: Ga4UserData = {},
): Promise<boolean> {
  return sendGa4EventCore({
    creds,
    gaCookie,
    userData,
    events: [
      {
        name: "add_to_cart",
        params: {
          currency: payload.currency,
          value: payload.value,
          items: payload.items.map((i) => ({
            item_id: i.id,
            item_name: i.name,
            price: i.price,
            quantity: i.quantity,
          })),
        },
      },
    ],
  });
}

/** begin_checkout (InitiateCheckout) GA4-MP fire. */
export async function sendGa4InitiateCheckout(
  creds: Ga4Creds,
  payload: InitiateCheckoutPayload,
  gaCookie: string | null,
  userData: Ga4UserData = {},
): Promise<boolean> {
  return sendGa4EventCore({
    creds,
    gaCookie,
    userData,
    events: [
      {
        name: "begin_checkout",
        params: {
          currency: payload.currency,
          value: payload.value,
          items: payload.items.map((i) => ({
            item_id: i.id,
            item_name: i.name,
            price: i.price,
            quantity: i.quantity,
          })),
        },
      },
    ],
  });
}

/** generate_lead (signup form completion) GA4-MP fire. */
export async function sendGa4Lead(
  creds: Ga4Creds,
  args: {
    eventId: string;
    gaCookie: string | null;
    userData?: Ga4UserData;
    method?: string;
  },
): Promise<boolean> {
  return sendGa4EventCore({
    creds,
    gaCookie: args.gaCookie,
    userData: args.userData,
    events: [
      {
        name: "generate_lead",
        params: {
          method: args.method ?? "signup",
          // Use the eventId as the dedup join key (paired with the client gtag fire).
          transaction_id: args.eventId,
        },
      },
    ],
  });
}
