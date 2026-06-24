// Meta Conversions API (CAPI) server fire (blueprint 2.7). Sends the deduped
// `Purchase` event to Meta via POST /v{ver}/{pixelId}/events. The client Pixel
// fires fbq('track','Purchase', {...}, { eventID }) with the SAME event_id; Meta
// dedups the server CAPI event against the browser Pixel event on
// (event_name + event_id) — so the conversion counts once even though it fires
// from both sides (resilient to ad-blockers / iOS tracking limits).
//
// FLAG-GATED: only calls the network when CAPI_ENABLED=true (off in dev/test).
// Flag-off → returns immediately (no-op). Requires fbPixelId (public) +
// fbAccessToken (sealed). fbTestEventCode (optional) routes the event to Meta's
// Test Events tab for verification without polluting production data.
import type { PurchasePayload } from "./events";

const GRAPH_VERSION = "v17.0";
const GRAPH_BASE = "https://graph.facebook.com";

export interface MetaCreds {
  pixelId: string;
  accessToken: string;
  testEventCode?: string | null;
}

function capiEnabled(): boolean {
  return process.env.CAPI_ENABLED === "true";
}

// Fire the Purchase to Meta CAPI. Resolves true on a 2xx, false otherwise (incl.
// flag-off / missing creds). Never throws — the caller is a non-blocking hook.
export async function sendMetaPurchase(
  creds: MetaCreds,
  payload: PurchasePayload,
): Promise<boolean> {
  if (!capiEnabled()) return false;
  if (!creds.pixelId || !creds.accessToken) return false;

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        // The dedup key — MUST equal the browser Pixel's eventID.
        event_id: payload.eventId,
        action_source: "website",
        custom_data: {
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
      },
    ],
  };
  if (creds.testEventCode) body.test_event_code = creds.testEventCode;

  const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(creds.pixelId)}/events?access_token=${encodeURIComponent(creds.accessToken)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[analytics] Meta CAPI returned ${res.status} (order #${payload.orderNumber})`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[analytics] Meta CAPI send failed (order #${payload.orderNumber}):`, error);
    return false;
  }
}
