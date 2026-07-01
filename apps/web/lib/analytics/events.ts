// Analytics event taxonomy (blueprint 2.7; TRACK-V2-A1). ONE place that
// defines which events exist and how they fire, so the storefront islands
// and the server fire-path agree on names and shapes.
//
// Firing rules (the contract):
//   view_item / add_to_cart / initiate_checkout  → CLIENT-ONLY (Pixel + gtag).
//   purchase                                      → DUAL-FIRE: client Pixel + gtag
//     with a shared event_id, AND server CAPI + GA4 Measurement Protocol + TikTok
//     Events API with the SAME event_id (dedup). The UUID is minted server-side
//     in placeOrder.
//   lead / complete_registration                  → Platform-owned fire on
//     /signup success (Phase A.10). Server-side only; GA4-MP + Meta CAPI + TikTok
//     Events API + Clarity.
//
// This module is pure: no DB, no Next, no env. It only describes the taxonomy and
// builds the typed payloads. The DB write lives in ./internal.ts; the external
// HTTP fires live in ./ga4.ts + ./meta-capi.ts + ./tiktok.ts; the orchestration
// in ./notify.ts; the platform senders in ./platform.ts.

/** Client-only storefront events (Pixel + gtag, no server counterpart). */
export type ClientEventName = "view_item" | "add_to_cart" | "initiate_checkout";

/** The one dual-fire (client + server, deduped by event_id) event. */
export type PurchaseEventName = "purchase";

/**
 * Platform-owned events fired by Hybrid's own marketing/signup/platform
 * surfaces (TRACK-V2-A1 §10). Server-side only — there's no storefront
 * island firing them, so no dual-fire / dedup concerns. Names mirror the
 * canonical Meta CAPI + GA4 + TikTok Events API spellings so the same
 * payload can fan out to all three.
 */
export type PlatformEventName = "lead" | "complete_registration";

export type AnalyticsEventName =
  | ClientEventName
  | PurchaseEventName
  | PlatformEventName;

/** Internal analytics_event.type values written to the DB (tenant-scoped). */
export type InternalEventType = "order.placed" | "product.viewed" | "cart.added";

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

/**
 * Shared shape for the platform-owned Lead / CompleteRegistration event
 * (TRACK-V2-A1 §10). Optional fields so the marketing-signup form
 * (which only has email + businessType) and a future B2B KYC form (which
 * may have phone + utm) can both produce a valid payload.
 */
export interface PlatformLeadPayload {
  /** Shared event_id (UUID v4) — also written to the tracking log. */
  eventId: string;
  /** "lead" (top-of-funnel) or "complete_registration" (signup completed). */
  eventName: PlatformEventName;
  email?: string | null;
  /** Business type from the signup form (retail | wholesale). */
  businessType?: string | null;
  /** Raw UTM bundle (utm_source/medium/campaign/term/content) when present.
   *  Phase A does not parse/store UTMs — Phase B adds the cookie + column
   *  capture. We pass through for future-proofing. */
  utm?: Record<string, string> | null;
}
