"use client";

// Live orders banner — toast-style notification that pops up when a new order
// arrives via SSE. Subscribes to /api/orders/stream and shows a brief banner
// with the order number + customer. Auto-dismisses after 8 seconds. Stacks
// up to 5 recent events.

import { useState } from "react";
import { useOrderStream, type OrderEvent } from "@/lib/orders/useOrderStream";
import type { Locale } from "@/lib/i18n/config";
import { formatMoney, formatNumber } from "@/lib/i18n/format";

interface ToastEvent extends OrderEvent {
  id: string;
  /** bumped when auto-dismissed */
  expired: boolean;
}

export function LiveOrdersBanner({
  enabled = true,
  locale = "en",
}: {
  enabled?: boolean;
  locale?: Locale;
}) {
  const [events, setEvents] = useState<ToastEvent[]>([]);

  useOrderStream({
    enabled,
    onEvent: (ev) => {
      setEvents((prev) => {
        const next: ToastEvent = { ...ev, id: `${ev.orderId}-${ev.at}`, expired: false };
        const updated = [next, ...prev].slice(0, 5);
        // Auto-expire after 8s.
        setTimeout(() => {
          setEvents((cur) =>
            cur.map((e) => (e.id === next.id ? { ...e, expired: true } : e)),
          );
          // Remove after fade-out completes.
          setTimeout(() => {
            setEvents((cur) => cur.filter((e) => e.id !== next.id));
          }, 500);
        }, 8_000);
        return updated;
      });
    },
  });

  if (events.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label={locale === "bn" ? "নতুন অর্ডার" : "New orders"}
      className="pointer-events-none fixed bottom-4 right-4 z-toast flex w-80 flex-col gap-2"
    >
      {events
        .filter((e) => !e.expired)
        .map((e) => (
          <a
            key={e.id}
            href={`/admin/orders/${e.orderId}`}
            className="pointer-events-auto flex items-center gap-3 rounded-lg border border-primary bg-primary-weak p-3 shadow-md transition-opacity hover:bg-surface"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-ink-on-primary">
              🛒
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                {locale === "bn" ? "নতুন অর্ডার" : "New order"} ·{" "}
                <span className="font-mono tnum">
                  #{formatNumber(e.orderNumber, locale)}
                </span>
              </p>
              <p className="text-2xs text-ink-muted">
                {formatMoney(e.grandTotal, locale)} ·{" "}
                {e.fulfillmentStatus}
              </p>
            </div>
          </a>
        ))}
    </div>
  );
}