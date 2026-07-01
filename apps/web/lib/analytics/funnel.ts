// Phase B funnel event taxonomy + builders (Hybrid Tracking V2).
//
// Pure module: no DB, no Next, no env. Defines the typed payload shapes for
// ViewContent / AddToCart / InitiateCheckout (the top-of-funnel events the
// storefront islands fire) and the shared `event_id` factory that lets the
// client Pixel/gtag fire and the server CAPI/GA4-MP fire be deduped.
//
// The previous Phase 1 / Phase 2.7 file `events.ts` keeps `purchase` as the
// only dual-fire event; the funnel events here are *client-only* by default
// (Meta Pixel + GA4 gtag), with optional server-side mirroring gated by
// flags the user can flip in their analytics settings. The server mirror
// helpers are added in `meta-capi.ts` / `ga4.ts` and orchestrated in
// `notify.ts` when called from a server action that has the cookies.
import { randomUUID, createHash } from "node:crypto";
import type { AnalyticsItem } from "./events";

/** Funnel events fired on the storefront (client islands + optional server mirror). */
export type FunnelEventName =
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout";

/** GA4 names for the same three events (Measurement Protocol + gtag). */
export const GA4_FUNNEL_EVENT: Record<FunnelEventName, string> = {
  ViewContent: "view_item",
  AddToCart: "add_to_cart",
  InitiateCheckout: "begin_checkout",
};

/** Meta Pixel names — PascalCase, same as the GA4 mapping's key. */
export const META_FUNNEL_EVENT: Record<FunnelEventName, string> = {
  ViewContent: "ViewContent",
  AddToCart: "AddToCart",
  InitiateCheckout: "InitiateCheckout",
};

/** TikTok Pixel names — TikTok uses different verbs. */
export const TIKTOK_FUNNEL_EVENT: Record<FunnelEventName, string> = {
  ViewContent: "ViewContent",
  AddToCart: "AddToCart",
  InitiateCheckout: "InitiateCheckout",
};

/** ViewContent payload — fired when a product detail page mounts. */
export interface ViewContentPayload {
  /** Shared dedup id (UUID v4); used by the optional server mirror. */
  eventId: string;
  currency: "BDT";
  value: number;
  items: AnalyticsItem[];
}

/** AddToCart payload — fired when the user clicks the Add to cart button. */
export interface AddToCartPayload {
  eventId: string;
  currency: "BDT";
  value: number;
  items: AnalyticsItem[];
}

/** InitiateCheckout payload — fired when the checkout page mounts. */
export interface InitiateCheckoutPayload {
  eventId: string;
  currency: "BDT";
  value: number;
  items: AnalyticsItem[];
}

/** Build a single line item from a variant price. */
export function toFunnelItem(input: {
  id: string;
  name: string;
  price: number;
  quantity: number;
}): AnalyticsItem {
  return {
    id: input.id,
    name: input.name,
    price: input.price,
    quantity: input.quantity,
  };
}

/** Sum the value of an items array. */
export function sumFunnelValue(items: AnalyticsItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

/** Mint a fresh dedup event id (UUID v4). Safe to call from client or server. */
export function buildFunnelEventId(): string {
  return randomUUID();
}

// --- Meta Enhanced Match hashing helpers ------------------------------------
//
// Meta's Conversions API accepts user data as raw strings OR SHA-256 hex
// (lowercase, trimmed). The hash form gives higher Event Match Quality, which
// improves attribution. We hash server-side and on the client; the client
// helper uses Web Crypto's SubtleCrypto so the browser can hash without a
// network round-trip (the value is later forwarded to the server by the
// analytics fire helper that reads it from the cookie).
//
// HASH RULES (Meta spec):
//   * trim leading/trailing whitespace
//   * lowercase (emails; for phone Meta specifies a separate normalization
//     that we approximate — strip non-digits, prefix '880' for BD numbers
//     when the country code is missing — see hashPhoneE164)
//   * SHA-256, hex-encoded, lowercase

/** Normalize + hash an email for Meta CAPI `em` field. */
export function hashEmailForMeta(input: string | null | undefined): string | null {
  if (!input) return null;
  const v = input.trim().toLowerCase();
  if (!v) return null;
  return createHash("sha256").update(v, "utf8").digest("hex");
}

/**
 * Normalize a Bangladesh/local phone to E.164-ish and hash. Best-effort:
 * digits-only then prefix `880` if the number doesn't start with one. Most
 * Bangladeshi numbers in our DB are 11 digits starting with `01`; this is
 * the same shape Meta's own normalizer produces.
 */
export function hashPhoneForMeta(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  // Already has a country code (e.g. starts with 880) — keep it; else prepend.
  const e164 = digits.startsWith("880") ? digits : `880${digits.replace(/^0+/, "")}`;
  return createHash("sha256").update(e164, "utf8").digest("hex");
}

/** Shape of `user_data` passed to Meta CAPI for enhanced match. */
export interface MetaUserData {
  email?: string | null;
  phone?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  externalId?: string | null;
  subscriptionId?: string | null;
}

/** Build the hashed Meta CAPI user_data block (only includes fields that resolved). */
export function buildMetaUserData(input: MetaUserData): Record<string, string> {
  const out: Record<string, string> = {};
  const em = hashEmailForMeta(input.email);
  if (em) out.em = em;
  const ph = hashPhoneForMeta(input.phone);
  if (ph) out.ph = ph;
  if (input.fbp) out.fbp = input.fbp;
  if (input.fbc) out.fbc = input.fbc;
  if (input.clientIp) out.client_ip_address = input.clientIp;
  if (input.userAgent) out.client_user_agent = input.userAgent;
  if (input.externalId) out.external_id = input.externalId;
  if (input.subscriptionId) out.subscription_id = input.subscriptionId;
  return out;
}

/**
 * Browser-side SHA-256 lowercase hex. Used by the storefront islands to
 * pre-hash email/phone *before* placing them on the `window` or cookie, so
 * raw PII never sits on the global. Uses Web Crypto SubtleCrypto when
 * available; returns `null` on an unsupported environment (server test
 * environment, very old browsers) so callers can fall back to raw values.
 */
export async function sha256HexBrowser(value: string): Promise<string | null> {
  if (typeof globalThis === "undefined") return null;
  // Node 20+ has globalThis.crypto.subtle; the server is fine to use this too
  // (no PII leak risk — the input is already client-side).
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) return null;
  try {
    const data = new TextEncoder().encode(value);
    const digest = await c.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}
