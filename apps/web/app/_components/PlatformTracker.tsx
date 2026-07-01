"use client";

// Platform-owned tracking client island (TRACK-V2-A1).
import { useEffect } from "react";
import type { TikTokQueue } from "@/lib/analytics/tiktok-queue";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
    ttq?: TikTokQueue;
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[][] };
  }
}

interface PlatformTrackerProps {
  ga4Id?: string | null;
  fbPixelId?: string | null;
  tiktokId?: string | null;
  clarityId?: string | null;
}

export function PlatformTracker({
  ga4Id,
  fbPixelId,
  tiktokId,
  clarityId,
}: PlatformTrackerProps) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (ga4Id) injectGa4(ga4Id);
    if (fbPixelId) injectMeta(fbPixelId);
    if (tiktokId) injectTikTok(tiktokId);
    if (clarityId) injectClarity(clarityId);
  }, [ga4Id, fbPixelId, tiktokId, clarityId]);

  return null;
}

function injectGa4(measurementId: string): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  if (typeof window.gtag === "function") {
    window.gtag("js", new Date());
    window.gtag("config", measurementId);
    window.gtag("event", "page_view");
    return;
  }
  const gtag = (...args: unknown[]) => {
    window.dataLayer!.push(args);
  };
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", measurementId);
  gtag("event", "page_view");

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
}

function injectMeta(pixelId: string): void {
  if (typeof window === "undefined") return;
  if (typeof window.fbq === "function") {
    window.fbq("track", "PageView");
    return;
  }
  const n: { callMethod?: (...a: unknown[]) => void; queue: unknown[]; loaded?: boolean; version?: string } & ((...a: unknown[]) => void) =
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
  window.fbq("track", "PageView");
}

function injectTikTok(pixelId: string): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { ttq?: TikTokQueue };
  if (w.ttq) {
    w.ttq.page?.();
    return;
  }
  const queue: unknown[][] = [];
  const stub: TikTokQueue = {
    track: (name: string, p?: Record<string, unknown>, o?: { event_id?: string }) =>
      queue.push(["track", name, p ?? {}, o ?? {}]),
    page: () => queue.push(["page"]),
    load: (id: string) => queue.push(["load", id]),
  };
  Object.defineProperty(stub, "_queue", { value: queue, enumerable: false });
  w.ttq = stub;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://analytics.tiktok.com/i18n/pixel/events.js";
  document.head.appendChild(script);
  w.ttq.load?.(pixelId);
  w.ttq.page?.();
}

function injectClarity(projectId: string): void {
  if (typeof window === "undefined") return;
  if (typeof window.clarity === "function") return;
  const c = ((...args: unknown[]) => {
    (c as unknown as { q?: unknown[][] }).q = (c as unknown as { q?: unknown[][] }).q ?? [];
    (c as unknown as { q: unknown[][] }).q.push(args);
  }) as Window["clarity"] & { q: unknown[][] };
  window.clarity = c;
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${encodeURIComponent(projectId)}`;
  document.head.appendChild(script);
}
