// Browser-only TikTok Pixel fire (client island). Separated from tiktok.ts
// so the server-side Events API (which imports @hybrid/db for logging) never
// leaks into the client bundle.
import type { PurchasePayload } from "./events";
import type { TikTokQueue } from "./tiktok-queue";

const PIXEL_JS = "https://analytics.tiktok.com/i18n/pixel/events.js";

function tiktokPixelEnabled(): boolean {
  return process.env.TIKTOK_ENABLED === "true";
}

function getTikTokQueue(): TikTokQueue | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { ttq?: TikTokQueue };
  if (!w.ttq) {
    const queue: unknown[][] = [];
    const t: TikTokQueue = {
      track: (name: string, p?: Record<string, unknown>, o?: { event_id?: string }) =>
        queue.push(["track", name, p ?? {}, o ?? {}]),
      page: () => queue.push(["page"]),
      load: (id: string) => queue.push(["load", id]),
    };
    Object.defineProperty(t, "_queue", { value: queue, enumerable: false });
    w.ttq = t;
    const script = document.createElement("script");
    script.async = true;
    script.src = PIXEL_JS;
    document.head.appendChild(script);
  }
  return w.ttq;
}

export function fireTikTokPixel(pixelId: string, payload: PurchasePayload): void {
  if (typeof window === "undefined") return;
  if (!pixelId) return;
  if (!tiktokPixelEnabled()) return;

  const ttq = getTikTokQueue();
  if (!ttq) return;

  ttq.load?.(pixelId);

  const contents = payload.items.map((i) => ({
    content_id: i.id,
    content_name: i.name,
    content_type: "product",
    price: i.price,
    quantity: i.quantity,
  }));

  ttq.track(
    "CompletePayment",
    {
      currency: payload.currency,
      value: payload.value,
      contents,
      content_type: "product",
      order_id: String(payload.orderNumber),
    },
    { event_id: payload.eventId },
  );
}
