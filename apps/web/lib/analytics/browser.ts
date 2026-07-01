"use client";

// Browser-only analytics helpers (Phase A+B). Used by the storefront islands
// (StorefrontTracker, PurchaseTracker, AddToCart, Checkout) to lazy-load the
// Meta Pixel / GA4 gtag / TikTok Pixel SDKs and fire the matching client
// events.

import type { AnalyticsItem } from "./events";
import {
  FunnelEventName,
  ViewContentPayload,
  AddToCartPayload,
  InitiateCheckoutPayload,
} from "./funnel";
import type { TikTokQueue } from "./tiktok-queue";

export type { TikTokQueue };

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    ttq?: TikTokQueue;
    _ttq?: unknown;
  }
}

export function loadMetaPixel(pixelId: string): void {
  if (typeof window === "undefined") return;
  if (!pixelId) return;
  if (window.fbq && (window._fbq as { initialized?: string[] } | undefined)?.initialized?.includes(pixelId)) {
    return;
  }
  if (!window.fbq) {
    const n: ((...args: unknown[]) => void) & {
      callMethod?: (...a: unknown[]) => void;
      queue: unknown[];
      loaded?: boolean;
      version?: string;
    } = (...args: unknown[]) => {
      if (n.callMethod) {
        n.callMethod(...args);
      } else {
        n.queue.push(args);
      }
    };
    n.queue = [];
    n.loaded = true;
    n.version = "2.0";
    window.fbq = n;
    window._fbq = n;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }
  window.fbq("init", pixelId);
  const fbqInternal = window.fbq as unknown as {
    initialized?: string[];
  };
  fbqInternal.initialized = Array.from(new Set([...(fbqInternal.initialized ?? []), pixelId]));
}

export function loadGtag(measurementId: string): void {
  if (typeof window === "undefined") return;
  if (!measurementId) return;
  if (window.gtag) {
    window.gtag("config", measurementId);
    return;
  }
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ "gtm.start": Date.now() });
  window.dataLayer.push("js", new Date());
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

export function loadTikTokPixel(pixelId: string): void {
  if (typeof window === "undefined") return;
  if (!pixelId) return;
  if (window.ttq && (window._ttq as { initialized?: string[] } | undefined)?.initialized?.includes(pixelId)) {
    return;
  }
  if (!window.ttq) {
    const stub: TikTokQueue = (() => {
      const queue: unknown[][] = [];
      const t = {
        track: (name: string, p?: Record<string, unknown>, o?: { event_id?: string }) =>
          queue.push(["track", name, p ?? {}, o ?? {}]),
        page: () => queue.push(["page"]),
        load: (id: string) => queue.push(["load", id]),
      };
      Object.defineProperty(t, "_queue", { value: queue, enumerable: false });
      return t;
    })();
    window.ttq = stub;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://analytics.tiktok.com/i18n/pixel/events.js";
    document.head.appendChild(script);
  }
  window.ttq.load?.(pixelId);
  const ttqInternal = window.ttq as unknown as { initialized?: string[] };
  ttqInternal.initialized = Array.from(new Set([...(ttqInternal.initialized ?? []), pixelId]));
}

export function itemsToPixelContents(items: AnalyticsItem[]): Array<{ id: string; quantity: number; item_price: number }> {
  return items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: i.price }));
}

export function itemsToGa4Items(items: AnalyticsItem[]): Array<{ item_id: string; item_name: string; price: number; quantity: number }> {
  return items.map((i) => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity }));
}

export function firePageView(ids: { fbPixelId: string | null; ga4MeasurementId: string | null; tiktokPixelId: string | null }): void {
  if (ids.fbPixelId) window.fbq?.("track", "PageView");
  if (ids.ga4MeasurementId) window.gtag?.("event", "page_view");
  if (ids.tiktokPixelId && window.ttq) {
    const ttq = window.ttq;
    ttq.page?.();
  }
}

function baseCustomData(payload: ViewContentPayload | AddToCartPayload | InitiateCheckoutPayload) {
  return {
    currency: payload.currency,
    value: payload.value,
    content_type: "product",
    content_ids: payload.items.map((i) => i.id),
    contents: itemsToPixelContents(payload.items),
  };
}

export function fireFunnelEvent(
  event: FunnelEventName,
  payload: ViewContentPayload | AddToCartPayload | InitiateCheckoutPayload,
  ids: { fbPixelId: string | null; ga4MeasurementId: string | null; tiktokPixelId: string | null },
): void {
  const metaEventName =
    event === "ViewContent" ? "ViewContent" :
    event === "AddToCart" ? "AddToCart" :
    "InitiateCheckout";
  const ga4EventName =
    event === "ViewContent" ? "view_item" :
    event === "AddToCart" ? "add_to_cart" :
    "begin_checkout";
  const tiktokEventName = metaEventName;

  if (ids.fbPixelId) {
    window.fbq?.(
      "track",
      metaEventName,
      baseCustomData(payload),
      { eventID: payload.eventId },
    );
  }
  if (ids.ga4MeasurementId) {
    window.gtag?.("event", ga4EventName, {
      currency: payload.currency,
      value: payload.value,
      items: itemsToGa4Items(payload.items),
      transaction_id: payload.eventId,
    });
  }
  if (ids.tiktokPixelId && window.ttq) {
    const ttq = window.ttq;
    ttq.track(
      tiktokEventName,
      baseCustomData(payload),
      { event_id: payload.eventId },
    );
  }
}

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const all = document.cookie ?? "";
  for (const part of all.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    const raw = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export function readFbp(): string | null {
  return readCookie("_fbp");
}

export function readFbc(): string | null {
  return readCookie("_fbc");
}

export function readGa(): string | null {
  return readCookie("_ga");
}

export function readUtmFromUrl(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const v = params.get(key);
    if (v) out[key] = v;
  }
  return out;
}

export function setJsonCookie(name: string, value: unknown, maxAgeSeconds: number): void {
  if (typeof document === "undefined") return;
  const encoded = encodeURIComponent(JSON.stringify(value));
  document.cookie = `${name}=${encoded}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

export function readJsonCookie<T>(name: string): T | null {
  const raw = readCookie(name);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
