// Analytics event taxonomy (blueprint 2.7). ONE place that defines which events
// exist and how they fire, so the storefront islands and the server fire-path
// agree on names and shapes.
//
// Firing rules (the contract):
//   view_item / add_to_cart / initiate_checkout  → CLIENT-ONLY (Pixel + gtag).
//   purchase                                      → DUAL-FIRE: client Pixel + gtag
//     with a shared event_id, AND server CAPI + GA4 Measurement Protocol with the
//     SAME event_id (dedup). The UUID is minted server-side in placeOrder.
//
// This module is pure: no DB, no Next, no env. It only describes the taxonomy and
// builds the typed payloads. The DB write lives in ./internal.ts; the external
// HTTP fires live in ./ga4.ts + ./meta-capi.ts; the orchestration in ./notify.ts.

/** Client-only storefront events (Pixel + gtag, no server counterpart). */
export type ClientEventName = "view_item" | "add_to_cart" | "initiate_checkout";

/** The one dual-fire (client + server, deduped by event_id) event. */
export type PurchaseEventName = "purchase";

export type AnalyticsEventName = ClientEventName | PurchaseEventName;

/** Internal analytics_event.type values written to the DB (tenant-scoped). */
export type InternalEventType = "order.placed" | "product.viewed" | "cart.added" | "lp.viewed";

/** A single line on a commerce event (Pixel/GA4 item shape, normalized). */
export interface AnalyticsItem {
  /** Product id (Pixel content_ids / GA4 item_id). */
  id: string;
  /** Display title (GA4 item_name). */
  name: string;
  /** Unit price in BDT. */
  price: number;
  quantity: number;
}

/** The deduped purchase payload shared by the client fire and the server fire. */
export interface PurchasePayload {
  /** Shared dedup key (UUID v4) — minted in placeOrder, used by Pixel eventID,
   *  CAPI event_id and GA4-MP. */
  eventId: string;
  /** Order number (GA4 transaction_id / Pixel order_id). */
  orderNumber: number;
  /** Order grand total in BDT. */
  value: number;
  currency: "BDT";
  items: AnalyticsItem[];
}
