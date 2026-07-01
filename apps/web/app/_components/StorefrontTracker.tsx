"use client";

// Storefront funnel tracker (Hybrid Tracking V2 Phase B).
//
// Client island rendered on every storefront layout. Responsibilities:
//   1. Load the per-tenant pixel SDKs ONCE per page (idempotent).
//   2. Fire `PageView` on initial mount + every Next.js route change (so
//      SPA navigation between /products/foo and /products/bar re-fires the
//      platforms' "page view" event).
//   3. When `pageType === "product"` (set by the PDP), fire `ViewContent`
//      with the product context provided.
//   4. Fire `InitiateCheckout` on the checkout page when the `pageType`
//      prop says so (set by the checkout page) — the checkout page is the
//      only non-add-to-cart surface that does this (cart→checkout is
//      server-rendered so we still need the client side to fire on mount).
//
// Add-to-cart events are NOT fired from this component — the AddToCart
// button fires them inline (so the click and the event are synchronized).
//
// All three platforms (Meta Pixel + GA4 gtag + TikTok Pixel) are configured
// at the same time; the helpers in `analytics/browser.ts` no-op when the
// matching id is null, so passing `null` for a platform this tenant
// hasn't configured is safe.
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  firePageView,
  fireFunnelEvent,
  loadMetaPixel,
  loadGtag,
  loadTikTokPixel,
} from "@/lib/analytics/browser";
import {
  buildFunnelEventId,
  sumFunnelValue,
  type ViewContentPayload,
  type InitiateCheckoutPayload,
  type AddToCartPayload,
} from "@/lib/analytics/funnel";
import type { AnalyticsItem } from "@/lib/analytics/events";

/** A single product context for ViewContent / AddToCart. */
export interface FunnelProductContext {
  id: string;
  name: string;
  price: number;
  quantity?: number;
}

/** Per-page context for the funnel. */
export type FunnelPageType = "home" | "collection" | "product" | "cart" | "checkout" | "other";

export interface StorefrontTrackerProps {
  /** Plaintext GA4 / Meta / TikTok ids (null = platform not configured for this tenant). */
  ids: { ga4MeasurementId: string | null; fbPixelId: string | null; tiktokPixelId: string | null };
  /** Privacy consent — when false, no events fire. Defaults to true in v1. */
  consent?: boolean;
  /** Set per page so the right event fires. */
  pageType?: FunnelPageType;
  /** Product context — used when pageType === "product" (for ViewContent) or cart. */
  product?: FunnelProductContext | null;
  /** Cart context — used when pageType === "checkout" (for InitiateCheckout). */
  cart?: { items: AnalyticsItem[]; value: number; currency: "BDT" } | null;
  /** If false, suppress the PageView fires (used by the embedded ProductPage's own tracker). */
  firePageView?: boolean;
}

// ---------------------------------------------------------------------------

export function StorefrontTracker({
  ids,
  consent = true,
  pageType = "other",
  product = null,
  cart = null,
  firePageView: shouldFirePageView = true,
}: StorefrontTrackerProps) {
  const pathname = usePathname();
  // Track which path+payload we've already fired a ViewContent / InitiateCheckout
  // for, so React's strict-mode double-mount and re-render don't double-fire.
  const lastPath = useRef<string | null>(null);
  // Mounted-once ref for SDK load (gated by pathname so SPA nav also reloads
  // nothing — SDKs are page-once and globally idempotent).
  const sdkLoaded = useRef(false);

  // (1) Load SDKs on first mount, ONCE per page.
  useEffect(() => {
    if (sdkLoaded.current) return;
    if (!consent) return;
    sdkLoaded.current = true;
    if (ids.fbPixelId) loadMetaPixel(ids.fbPixelId);
    if (ids.ga4MeasurementId) loadGtag(ids.ga4MeasurementId);
    if (ids.tiktokPixelId) loadTikTokPixel(ids.tiktokPixelId);
  }, [ids.fbPixelId, ids.ga4MeasurementId, ids.tiktokPixelId, consent]);

  // (2) Fire PageView on initial mount + every pathname change.
  useEffect(() => {
    if (!consent) return;
    if (!shouldFirePageView) return;
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    firePageView(ids);
  }, [pathname, consent, shouldFirePageView, ids]);

  // (3) ViewContent on product pages (and on initial mount when the PDP
  // hydrates the product prop).
  useEffect(() => {
    if (!consent) return;
    if (pageType !== "product" || !product) return;
    const items: AnalyticsItem[] = [
      { id: product.id, name: product.name, price: product.price, quantity: product.quantity ?? 1 },
    ];
    const payload: ViewContentPayload = {
      eventId: buildFunnelEventId(),
      currency: "BDT",
      value: sumFunnelValue(items),
      items,
    };
    fireFunnelEvent("ViewContent", payload, ids);
  }, [consent, pageType, product, ids]);

  // (4) InitiateCheckout on checkout page mount (cart context provided).
  useEffect(() => {
    if (!consent) return;
    if (pageType !== "checkout") return;
    if (!cart || cart.items.length === 0) return;
    const payload: InitiateCheckoutPayload = {
      eventId: buildFunnelEventId(),
      currency: cart.currency,
      value: cart.value,
      items: cart.items,
    };
    fireFunnelEvent("InitiateCheckout", payload, ids);
  }, [consent, pageType, cart, ids]);

  // (5) Helper: an AddToCart component can call this on click to fire the
  // matching client event for a single product. Returns the event_id used
  // (also exposed via a custom event so the server-side mirror can pick it
  // up if/when one is added).
  // We expose it on the window for the AddToCart island; it's a small
  // escape hatch and the function is read-only — it does not mutate globals.
  useEffect(() => {
    if (typeof window === "undefined") return;
    type Helper = (p: FunnelProductContext) => string;
    (window as unknown as { __hybridFireAddToCart?: Helper }).__hybridFireAddToCart = (p) => {
      if (!consent) return "";
      const items: AnalyticsItem[] = [{ id: p.id, name: p.name, price: p.price, quantity: p.quantity ?? 1 }];
      const payload: AddToCartPayload = {
        eventId: buildFunnelEventId(),
        currency: "BDT",
        value: sumFunnelValue(items),
        items,
      };
      fireFunnelEvent("AddToCart", payload, ids);
      return payload.eventId;
    };
  }, [consent, ids]);

  // No visible UI — pure side-effect island.
  return null;
}
