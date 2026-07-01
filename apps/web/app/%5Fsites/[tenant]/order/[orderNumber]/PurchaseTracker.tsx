"use client";

// Browser half of the deduped purchase fire (blueprint 2.7; TRACK-V2-A1).
// Renders on the order success page when the tenant has analytics enabled +
// public IDs set. Loads the GA4 gtag.js + Meta Pixel + TikTok Pixel snippets
// (only for the configured IDs), then fires:
//
//   fbq('track','Purchase', {...}, { eventID })        ← shared event_id
//   gtag('event','purchase', { transaction_id })       ← same id as GA4-MP transaction
//   ttq.track('CompletePayment', {...}, { event_id })  ← same id as TikTok Events API
//
// The SERVER already fired CAPI + GA4-MP + TikTok Events API with the SAME
// event_id (preparePurchaseFire on the page). Meta/GA4/TikTok each dedup the
// server hit against the browser fire on event_id / transaction_id. So the
// conversion counts once even though both sides fire. Guarded so a Strict-Mode
// double-mount / revisit fires the browser event at most once per mount via a
// ref. Pixel/gtag/ttq themselves are ad-blockable — that's exactly why the
// server half exists.
import { useEffect, useRef } from "react";
import type { PurchasePayload, AnalyticsItem } from "@/lib/analytics/events";
import type { MetaUserData } from "@/lib/analytics/funnel";
import { fireTikTokPixel } from "@/lib/analytics/tiktok-pixel";
import { readFbp, readFbc, readGa } from "@/lib/analytics/browser";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

interface PurchaseTrackerProps {
  ga4MeasurementId: string | null;
  fbPixelId: string | null;
  tiktokPixelId: string | null;
  payload: PurchasePayload;
  userData?: Partial<MetaUserData>;
}

export function PurchaseTracker({
  ga4MeasurementId,
  fbPixelId,
  tiktokPixelId,
  payload,
  userData,
}: PurchaseTrackerProps) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    // Collect enhanced-match cookies at fire time (after the SDKs have had a
    // chance to write _fbp / _fbc). If the server already forwarded them, the
    // client values are the same; if not, this closes the loop.
    const enhanced: Partial<MetaUserData> = {
      ...userData,
      fbp: userData?.fbp ?? readFbp(),
      fbc: userData?.fbc ?? readFbc(),
    };

    if (fbPixelId) fireMetaPixel(fbPixelId, payload, enhanced);
    if (ga4MeasurementId) fireGtag(ga4MeasurementId, payload, enhanced);
    if (tiktokPixelId) fireTikTokPixel(tiktokPixelId, payload, enhanced);
  }, []);

  return null;
}

function fireMetaPixel(pixelId: string, payload: PurchasePayload, userData: Partial<MetaUserData>): void {
  if (typeof window === "undefined") return;
  if (!window.fbq) {
    const n: { callMethod?: (...a: unknown[]) => void; queue: unknown[]; push?: unknown; loaded?: boolean; version?: string } & ((...a: unknown[]) => void) =
      function (...args: unknown[]) {
        if (n.callMethod) {
          n.callMethod(...args);
        } else {
          n.queue.push(args);
        }
      } as never;
    n.queue = [];
    n.loaded = true;
    n.version = "2.0";
    window.fbq = n as unknown as (...args: unknown[]) => void;
    window._fbq = window._fbq ?? n;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
    window.fbq("init", pixelId);
  }

  const customData: Record<string, unknown> = {
    currency: payload.currency,
    value: payload.value,
    order_id: String(payload.orderNumber),
    content_type: "product",
    content_ids: payload.items.map((i: AnalyticsItem) => i.id),
    contents: payload.items.map((i: AnalyticsItem) => ({
      id: i.id,
      quantity: i.quantity,
      item_price: i.price,
    })),
  };

  // Forward enhanced-match signals in the event options (fbq accepts a
  // user_data map in the third/fourth argument for some versions, but the
  // safest cross-version path is to attach known match keys to the event
  // options object so the pixel can pick them up).
  const eventOptions: Record<string, unknown> = { eventID: payload.eventId };
  if (userData.fbp) eventOptions.fbp = userData.fbp;
  if (userData.fbc) eventOptions.fbc = userData.fbc;

  window.fbq?.("track", "Purchase", customData, eventOptions);
}

function fireGtag(measurementId: string, payload: PurchasePayload, userData: Partial<MetaUserData>): void {
  if (typeof window === "undefined") return;
  if (!window.gtag) {
    window.dataLayer = window.dataLayer ?? [];
    const gtag = (...args: unknown[]) => {
      window.dataLayer!.push(args);
    };
    window.gtag = gtag;
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
    window.gtag("js", new Date());
    window.gtag("config", measurementId);
  }

  // Read _ga for client_id consistency with GA4-MP. Cookie format is usually
  // GA1.1.XXXXXXXXXX.YYYYYYYYYY; we take the last two segments.
  const gaCookie = readGa();
  let clientId: string | undefined;
  if (gaCookie) {
    const parts = gaCookie.split(".");
    if (parts.length >= 2) {
      clientId = parts.slice(-2).join(".");
    }
  }

  const params: Record<string, unknown> = {
    transaction_id: String(payload.orderNumber),
    currency: payload.currency,
    value: payload.value,
    items: payload.items.map((i: AnalyticsItem) => ({
      item_id: i.id,
      item_name: i.name,
      price: i.price,
      quantity: i.quantity,
    })),
  };
  if (clientId) params.client_id = clientId;
  if (userData.userAgent) params.user_agent = userData.userAgent;

  window.gtag?.("event", "purchase", params);
}
