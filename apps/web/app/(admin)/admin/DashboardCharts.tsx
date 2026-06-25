// Dashboard data-viz — pure CSS/SVG, server-rendered, zero client JS and zero
// new deps (DESIGN keeps the admin bundle lean). Hybrid brand only: indigo
// primary + token surfaces, Latin numerals / tabular-nums (admin §4.4).
import { StatusBadge } from "@hybrid/ui";
import type { Locale } from "@/lib/i18n/config";
import { formatMoney, formatNumber } from "@/lib/i18n/format";

// 14-day revenue trend. The peak day is called out in solid primary with its
// value floated above; the rest read as quiet primary-weak columns.
export function TrendChart({
  series,
  locale = "en",
  ordersUnit = "orders",
}: {
  series: { day: string; orders: number; revenue: number }[];
  locale?: Locale;
  ordersUnit?: string;
}) {
  const max = Math.max(1, ...series.map((s) => s.revenue));
  let peakIdx = 0;
  for (let i = 1; i < series.length; i++) {
    if ((series[i]?.revenue ?? 0) > (series[peakIdx]?.revenue ?? 0)) peakIdx = i;
  }

  return (
    // items-stretch (default) so each column fills h-44; the inner flex-1 bar
    // area then has a definite height for the percentage to resolve against.
    <div className="flex h-44 gap-1.5">
      {series.map((s, i) => {
        const isPeak = i === peakIdx && s.revenue > 0;
        const pct = s.revenue > 0 ? Math.max(6, (s.revenue / max) * 100) : 2;
        const date = new Date(s.day + "T00:00:00+06:00");
        return (
          <div key={s.day} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="relative flex w-full flex-1 items-end">
              {isPeak && (
                <span className="absolute inset-x-0 -top-1 z-10 -translate-y-full whitespace-nowrap text-center text-2xs font-bold text-ink">
                  {formatMoney(s.revenue, locale)}
                </span>
              )}
              <div
                className={`w-full rounded-t-sm transition-colors ${isPeak ? "bg-primary" : "bg-primary-weak"}`}
                style={{ height: `${pct}%` }}
                title={`${s.day} · ${formatMoney(s.revenue, locale)} · ${formatNumber(s.orders, locale)} ${ordersUnit}`}
              />
            </div>
            <span className="text-2xs leading-none text-ink-subtle tnum">
              {date.getUTCDate()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Order-status mix as labelled proportion bars — the reusable StatusBadge
// supplies the canonical color+icon+Bengali label per fulfillment state.
export function StatusBars({
  rows,
  locale = "en",
}: {
  rows: { status: string; count: number }[];
  locale?: Locale;
}) {
  const total = rows.reduce((sum, r) => sum + r.count, 0) || 1;
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const pct = Math.round((r.count / total) * 100);
        return (
          <li key={r.status} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <StatusBadge kind="fulfillment" value={r.status} lang={locale} />
              <span className="font-mono text-xs font-semibold text-ink tnum">
                {formatNumber(r.count, locale)}
                <span className="ml-1 text-ink-subtle">· {formatNumber(pct, locale)}%</span>
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
