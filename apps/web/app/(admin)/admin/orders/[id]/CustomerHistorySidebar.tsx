// Customer history sidebar — shown on order detail when the customer has prior
// orders. Server-rendered, zero client JS. Bilingual labels.

import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { StatusBadge } from "@hybrid/ui";

export function CustomerHistorySidebar({
  customerId,
  history,
  locale = "en",
}: {
  customerId: string;
  history: NonNullable<
    import("@/lib/admin/orders").OrderDetail["customerHistory"]
  >;
  locale?: Locale;
}) {
  const cancelledRate =
    history.totalOrders > 0
      ? Math.round((history.cancelledCount / history.totalOrders) * 100)
      : 0;
  const returnedRate =
    history.totalOrders > 0
      ? Math.round((history.returnedCount / history.totalOrders) * 100)
      : 0;
  const isLoyal = history.totalOrders >= 5;
  const isNew = history.totalOrders <= 1;

  return (
    <aside className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {locale === "bn" ? "গ্রাহক ইতিহাস" : "Customer history"}
        </h3>
        <Link
          href={`/admin/customers/${customerId}`}
          className="text-2xs font-semibold text-primary hover:underline"
        >
          {locale === "bn" ? "প্রোফাইল দেখুন" : "View profile"} →
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md bg-surface-2 px-3 py-2">
          <p className="text-2xs text-ink-subtle">
            {locale === "bn" ? "মোট অর্ডার" : "Total orders"}
          </p>
          <p className="font-mono text-base font-bold text-ink tnum">
            {formatNumber(history.totalOrders, locale)}
          </p>
        </div>
        <div className="rounded-md bg-surface-2 px-3 py-2">
          <p className="text-2xs text-ink-subtle">
            {locale === "bn" ? "Lifetime value" : "Lifetime value"}
          </p>
          <p className="font-mono text-base font-bold text-ink tnum">
            {formatMoney(history.lifetimeValue, locale)}
          </p>
        </div>
        <div className="rounded-md bg-surface-2 px-3 py-2">
          <p className="text-2xs text-ink-subtle">
            {locale === "bn" ? "বাতিল হার" : "Cancel rate"}
          </p>
          <p
            className={`font-mono text-base font-bold tnum ${
              cancelledRate > 20 ? "text-danger" : "text-ink"
            }`}
          >
            {formatNumber(cancelledRate, locale)}%
          </p>
        </div>
        <div className="rounded-md bg-surface-2 px-3 py-2">
          <p className="text-2xs text-ink-subtle">
            {locale === "bn" ? "রিটার্ন হার" : "Return rate"}
          </p>
          <p
            className={`font-mono text-base font-bold tnum ${
              returnedRate > 15 ? "text-warning" : "text-ink"
            }`}
          >
            {formatNumber(returnedRate, locale)}%
          </p>
        </div>
      </div>

      {/* Loyalty tag */}
      <div className="flex flex-wrap gap-1.5">
        {isLoyal && (
          <span className="rounded-full bg-success-weak px-2 py-0.5 text-2xs font-semibold text-success">
            {locale === "bn" ? "⭐ নিয়মিত গ্রাহক" : "⭐ Loyal customer"}
          </span>
        )}
        {isNew && (
          <span className="rounded-full bg-info-weak px-2 py-0.5 text-2xs font-semibold text-info">
            {locale === "bn" ? "🆕 নতুন গ্রাহক" : "🆕 New customer"}
          </span>
        )}
        {cancelledRate > 20 && (
          <span className="rounded-full bg-warning-weak px-2 py-0.5 text-2xs font-semibold text-warning">
            {locale === "bn" ? "⚠️ উচ্চ বাতিল হার" : "⚠️ High cancel rate"}
          </span>
        )}
      </div>

      {/* Recent orders */}
      {history.recentOrders.length > 0 && (
        <div>
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
            {locale === "bn" ? "সাম্প্রতিক অর্ডার" : "Recent orders"}
          </p>
          <ul className="space-y-1.5">
            {history.recentOrders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/admin/orders/${o.id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2"
                >
                  <span className="font-mono text-xs font-semibold text-primary tnum">
                    #{formatNumber(o.orderNumber, locale)}
                  </span>
                  <span className="font-mono text-xs text-ink-subtle tnum">
                    {formatMoney(o.grandTotal, locale)}
                  </span>
                  <StatusBadge
                    kind="fulfillment"
                    value={o.fulfillmentStatus}
                    lang={locale}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}