"use client";

// Browser half of the deduped purchase fire (blueprint 2.7). Renders on the order
// success page when the tenant has analytics enabled + public IDs set. Loads the
// GA4 gtag.js + Meta Pixel snippets (only for the configured IDs), then fires:
//
//   fbq('track','Purchase', {...}, { eventID })   ← shared event_id
//   gtag('event','purchase', { transaction_id })  ← same id as GA4-MP transaction
//
// The SERVER already fired CAPI + GA4-MP with the SAME event_id (preparePurchaseFire
// on the page). Meta dedups on (Purchase + eventID); GA4 dedups on
// (purchase + transaction_id). So the conversion counts once even though both
// sides fire. Guarded so a Strict-Mode double-mount / revisit fires the browser
// event at most once per mount via a ref. Pixel/gtag themselves are ad-blockable
// — that's exactly why the server half exists.
import { useEffect, useRef } from "react";
import type { PurchasePayload, AnalyticsItem } from "@/lib/analytics/events";

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
  payload: PurchasePayload;
}

export function PurchaseTracker({ ga4MeasurementId, fbPixelId, payload }: PurchaseTrackerProps) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    if (fbPixelId) fireMetaPixel(fbPixelId, payload);
    if (ga4MeasurementId) fireGtag(ga4MeasurementId, payload);
  }, []);

  // No visible UI — pure side-effect island.
  return null;
}

function fireMetaPixel(pixelId: string, payload: PurchasePayload): void {
  if (typeof window === "undefined") return;
  if (!window.fbq) {
    // Minimal Pixel bootstrap (the standard fbq stub). Loads fbevents.js once.
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
  window.fbq?.(
    "track",
    "Purchase",
    {
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
    },
    { eventID: payload.eventId },
  );
}

function fireGtag(measurementId: string, payload: PurchasePayload): void {
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
  window.gtag?.("event", "purchase", {
    transaction_id: String(payload.orderNumber),
    currency: payload.currency,
    value: payload.value,
    items: payload.items.map((i: AnalyticsItem) => ({
      item_id: i.id,
      item_name: i.name,
      price: i.price,
      quantity: i.quantity,
    })),
  });
}
