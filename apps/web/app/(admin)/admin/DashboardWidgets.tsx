// Dashboard widgets — small, focused UI pieces that compose with DashboardCharts.
// Server-rendered, zero client JS. Hybrid brand tokens, bilingual labels via props.

import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { timeAgo } from "@/lib/admin/format";

/** This week vs prior week — a horizontal pair of bars showing direction + delta. */
export function WeeklyComparison({
  thisWeekOrders,
  thisWeekRevenue,
  lastWeekOrders,
  lastWeekRevenue,
  locale = "en",
  ordersLabel = "orders",
  revenueLabel = "revenue",
}: {
  thisWeekOrders: number;
  thisWeekRevenue: number;
  lastWeekOrders: number;
  lastWeekRevenue: number;
  locale?: Locale;
  ordersLabel?: string;
  revenueLabel?: string;
}) {
  const max = Math.max(1, thisWeekOrders, lastWeekOrders);
  const ordersDelta = lastWeekOrders > 0
    ? Math.round(((thisWeekOrders - lastWeekOrders) / lastWeekOrders) * 100)
    : thisWeekOrders > 0 ? 100 : 0;
  const revenueDelta = lastWeekRevenue > 0
    ? Math.round(((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100)
    : thisWeekRevenue > 0 ? 100 : 0;
  const ordersUp = ordersDelta >= 0;
  const revenueUp = revenueDelta >= 0;

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {locale === "bn" ? "গত ৭ দিন বনাম আগের ৭ দিন" : "This week vs last"}
      </p>
      <div className="mt-3 space-y-3">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-2xs text-ink-muted">{ordersLabel}</p>
            <p className={`text-2xs font-semibold ${ordersUp ? "text-success" : "text-danger"}`}>
              {ordersUp ? "▲" : "▼"} {formatNumber(Math.abs(ordersDelta), locale)}%
            </p>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-ink tnum">
              {formatNumber(thisWeekOrders, locale)}
            </span>
            <span className="text-xs text-ink-subtle">
              / {formatNumber(lastWeekOrders, locale)}
            </span>
          </div>
          <div className="mt-1.5 flex h-1.5 gap-0.5">
            <div
              className="rounded-full bg-primary"
              style={{ width: `${(thisWeekOrders / max) * 50}%` }}
            />
            <div
              className="rounded-full bg-surface-2"
              style={{ width: `${(lastWeekOrders / max) * 50}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-2xs text-ink-muted">{revenueLabel}</p>
            <p className={`text-2xs font-semibold ${revenueUp ? "text-success" : "text-danger"}`}>
              {revenueUp ? "▲" : "▼"} {formatNumber(Math.abs(revenueDelta), locale)}%
            </p>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-ink tnum">
              {formatMoney(thisWeekRevenue, locale)}
            </span>
            <span className="text-xs text-ink-subtle">
              / {formatMoney(lastWeekRevenue, locale)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Top 5 selling products (last 30 days) — ranked list with quantity + revenue. */
export function TopProducts({
  products,
  locale = "en",
  emptyLabel = "No sales yet",
  seeAllLabel = "See all products",
  seeAllHref = "/admin/products",
}: {
  products: { id: string; name: string; sold: number; revenue: number }[];
  locale?: Locale;
  emptyLabel?: string;
  seeAllLabel?: string;
  seeAllHref?: string;
}) {
  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {locale === "bn" ? "শীর্ষ পণ্য (৩০ দিন)" : "Top products (30d)"}
        </p>
        <p className="mt-6 text-center text-sm text-ink-subtle">{emptyLabel}</p>
      </div>
    );
  }

  const maxSold = Math.max(1, ...products.map((p) => p.sold));

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {locale === "bn" ? "শীর্ষ পণ্য (৩০ দিন)" : "Top products (30d)"}
        </p>
        <Link href={seeAllHref} className="text-2xs font-semibold text-primary hover:underline">
          {seeAllLabel} →
        </Link>
      </div>
      <ol className="mt-3 space-y-2.5">
        {products.map((p, i) => (
          <li key={p.id} className="flex items-center gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-2xs font-bold text-ink-muted">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <Link
                href={`/admin/products/${p.id}/edit`}
                className="block truncate text-sm font-medium text-ink hover:text-primary"
              >
                {p.name}
              </Link>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(p.sold / maxSold) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-2xs font-semibold text-ink-subtle tnum">
                  {formatNumber(p.sold, locale)} {locale === "bn" ? "বিক্রি" : "sold"}
                </span>
              </div>
            </div>
            <span className="font-mono text-xs font-semibold text-ink tnum">
              {formatMoney(p.revenue, locale)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Recent activity feed — last 5 order events. Compact timeline format. */
export function ActivityFeed({
  items,
  locale = "en",
  emptyLabel = "No recent activity",
}: {
  items: {
    type: "placed" | "shipped" | "delivered" | "cancelled";
    orderId: string;
    orderNumber: number;
    customerName: string | null;
    amount: number;
    at: string;
  }[];
  locale?: Locale;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {locale === "bn" ? "সাম্প্রতিক কার্যকলাপ" : "Recent activity"}
        </p>
        <p className="mt-6 text-center text-sm text-ink-subtle">{emptyLabel}</p>
      </div>
    );
  }

  const ICONS: Record<typeof items[number]["type"], string> = {
    placed: "🛒",
    shipped: "📦",
    delivered: "✓",
    cancelled: "✕",
  };
  const LABELS: Record<typeof items[number]["type"], string> = {
    placed: locale === "bn" ? "নতুন অর্ডার" : "New order",
    shipped: locale === "bn" ? "পাঠানো হয়েছে" : "Shipped",
    delivered: locale === "bn" ? "ডেলিভারি হয়েছে" : "Delivered",
    cancelled: locale === "bn" ? "বাতিল" : "Cancelled",
  };
  const TONES: Record<typeof items[number]["type"], string> = {
    placed: "text-primary",
    shipped: "text-info",
    delivered: "text-success",
    cancelled: "text-danger",
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {locale === "bn" ? "সাম্প্রতিক কার্যকলাপ" : "Recent activity"}
      </p>
      <ul className="mt-3 space-y-2.5">
        {items.map((it) => (
          <li key={`${it.orderId}-${it.at}`} className="flex items-start gap-2.5">
            <span className={`mt-0.5 text-sm ${TONES[it.type]}`}>{ICONS[it.type]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs">
                <span className="font-semibold text-ink">{LABELS[it.type]}</span>
                {" · "}
                <Link
                  href={`/admin/orders/${it.orderId}`}
                  className="font-mono text-primary hover:underline"
                >
                  #{formatNumber(it.orderNumber, locale)}
                </Link>
                {it.customerName && (
                  <>
                    {" · "}
                    <span className="text-ink-muted">{it.customerName}</span>
                  </>
                )}
              </p>
              <p className="mt-0.5 text-2xs text-ink-subtle">
                {formatMoney(it.amount, locale)} · {timeAgo(it.at, locale)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}