// GA4 Measurement Protocol server fire (blueprint 2.7). Sends the deduped
// `purchase` event to GA4 via POST /mp/collect so server-attributed conversions
// land even when the client gtag is blocked. The client gtag (storefront island)
// fires the SAME purchase with the SAME transaction_id; GA4 dedups on the pair
// (event name + transaction_id) the way Meta dedups on event_id.
//
// FLAG-GATED: only calls the network when GA4_ENABLED=true (off in dev/test).
// Flag-off → returns immediately (no-op). Requires ga4MeasurementId (public) +
// ga4ApiSecret (sealed). client_id is derived from the forwarded _ga cookie so
// the server hit attributes to the same GA client as the browser; missing cookie
// falls back to a synthetic id (GA4 records it as "(not set)" attribution).
import type { PurchasePayload } from "./events";

const MP_ENDPOINT = "https://www.google-analytics.com/mp/collect";

export interface Ga4Creds {
  measurementId: string;
  apiSecret: string;
}

// Parse the GA4 client_id out of a forwarded _ga cookie value. The cookie looks
// like "GA1.1.1234567890.1700000000"; GA4 client_id is the last two dot-segments
// ("1234567890.1700000000"). Returns null when absent/malformed.
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

// Fire the purchase to GA4-MP. Resolves true on a 2xx, false otherwise (incl.
// flag-off / missing creds). Never throws — the caller is a non-blocking hook.
export async function sendGa4Purchase(
  creds: Ga4Creds,
  payload: PurchasePayload,
  gaCookie: string | null,
): Promise<boolean> {
  if (!ga4Enabled()) return false;
  if (!creds.measurementId || !creds.apiSecret) return false;

  // No browser client_id → synthesize a stable-ish one. GA4 still ingests the
  // event; attribution shows "(not set)" (blueprint edge case).
  const clientId = clientIdFromGaCookie(gaCookie) ?? `${Date.now()}.${Math.floor(Math.random() * 1e9)}`;

  const body = {
    client_id: clientId,
    // De-dupes against the client gtag purchase with the same transaction_id.
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
  };

  const url = `${MP_ENDPOINT}?measurement_id=${encodeURIComponent(creds.measurementId)}&api_secret=${encodeURIComponent(creds.apiSecret)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[analytics] GA4-MP returned ${res.status} (order #${payload.orderNumber})`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[analytics] GA4-MP send failed (order #${payload.orderNumber}):`, error);
    return false;
  }
}
