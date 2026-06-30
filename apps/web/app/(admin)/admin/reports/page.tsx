import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import {
  getSalesReport,
  getTopProducts,
  getStatusReport,
  getCodReport,
  getProfitReport,
  getCourierPerformance,
  defaultRange,
  type DateRange,
} from "@/lib/admin/reports";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { PageHeader, StatStrip, StatCard } from "../_ui";
import { TrendChart, StatusBars } from "../DashboardCharts";
import { ReportsControls } from "./ReportsControls";

// Reports & Finance (tenant roadmap P2-1). Range-bounded sales trend, top
// products, fulfilment/RTO breakdown, COD collection, and gross profit/margin.
// Admin = Latin numerals. All data via withTenant (RLS).
export const dynamic = "force-dynamic";

interface ReportsPageProps {
  searchParams: Promise<{ from?: string; to?: string; r?: string }>;
}

function todayDhaka(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function rangeFor(sp: { from?: string; to?: string; r?: string }): { range: DateRange; preset: string } {
  const today = todayDhaka();
  const presetDays = sp.r === "7" ? 7 : sp.r === "90" ? 90 : sp.r === "30" ? 30 : null;
  if (presetDays) {
    const end = new Date(today + "T00:00:00+06:00");
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (presetDays - 1));
    return { range: { from: start.toISOString().slice(0, 10), to: today }, preset: String(presetDays) };
  }
  if (sp.from && sp.to && DATE_RE.test(sp.from) && DATE_RE.test(sp.to)) {
    return { range: { from: sp.from, to: sp.to }, preset: "" };
  }
  return { range: defaultRange(today), preset: "30" };
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const { locale, d } = await getDict();
  const t = d.admin.reports;

  const sp = await searchParams;
  const { range, preset } = rangeFor(sp);

  const [sales, top, status, cod, profit, couriers] = await Promise.all([
    getSalesReport(tenantId, session.userId, range),
    getTopProducts(tenantId, session.userId, range, 8),
    getStatusReport(tenantId, session.userId, range),
    getCodReport(tenantId, session.userId),
    getProfitReport(tenantId, session.userId, range),
    getCourierPerformance(tenantId, session.userId, range),
  ]);

  const pct = (n: number) => `${formatNumber(Math.round(n * 100), locale)}%`;

  return (
    <div className="space-y-5">
      <PageHeader title={t.title} subtitle={`${range.from} — ${range.to}`} />

      <ReportsControls initialRange={range} locale={locale} />

      {/* Range presets */}
      <div className="flex gap-2">
        {[
          { r: "7", label: t.range.d7 },
          { r: "30", label: t.range.d30 },
          { r: "90", label: t.range.d90 },
        ].map((p) => {
          const active = preset === p.r;
          return (
            <a
              key={p.r}
              href={`/admin/reports?r=${p.r}`}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                active ? "bg-primary text-ink-on-primary" : "border border-border bg-surface text-ink-muted hover:bg-surface-2"
              }`}
            >
              {p.label}
            </a>
          );
        })}
      </div>

      <StatStrip>
        <StatCard label={t.stats.totalSales} value={formatMoney(sales.totalRevenue, locale)} mono />
        <StatCard label={t.stats.orders} value={formatNumber(sales.totalOrders, locale)} sub={`${t.stats.avgPrefix} ${formatMoney(sales.avgOrderValue, locale)}`} />
        <StatCard
          label={t.stats.grossProfit}
          value={profit.hasCost ? formatMoney(profit.grossProfit, locale) : "—"}
          sub={profit.hasCost ? `${t.stats.marginPrefix} ${pct(profit.margin)}` : t.stats.setCostPrice}
          tone={profit.hasCost ? "success" : "muted"}
          mono={profit.hasCost}
        />
        <StatCard
          label={t.stats.rtoRate}
          value={pct(status.rtoRate)}
          sub={`${t.stats.deliveryPrefix} ${pct(status.deliveryRate)}`}
          tone={status.rtoRate > 0.25 ? "danger" : "default"}
        />
      </StatStrip>

      {/* Sales trend */}
      <section className="rounded-lg border border-border bg-surface p-4 shadow-xs">
        <h2 className="mb-4 text-sm font-bold text-ink">{t.salesTrend}</h2>
        <TrendChart series={sales.days} locale={locale} ordersUnit={d.admin.dashboard.ordersUnit} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {/* Top products */}
        <div className="overflow-hidden rounded-lg border border-border bg-surface lg:col-span-2">
          <h2 className="border-b border-border px-4 py-3 text-sm font-bold text-ink">{t.topProducts}</h2>
          {top.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">{t.noSales}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2 font-semibold">{t.col.product}</th>
                  <th className="px-4 py-2 text-right font-semibold">{t.col.units}</th>
                  <th className="px-4 py-2 text-right font-semibold">{t.col.sales}</th>
                </tr>
              </thead>
              <tbody>
                {top.map((p, i) => (
                  <tr key={(p.productId ?? "x") + i} className={i % 2 === 1 ? "bg-surface-2" : undefined}>
                    <td className="px-4 py-2 text-ink">{p.title}</td>
                    <td className="px-4 py-2 text-right font-mono text-ink-muted tnum">{formatNumber(p.units, locale)}</td>
                    <td className="px-4 py-2 text-right font-mono font-semibold text-ink tnum">
                      {formatMoney(p.revenue, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Status + COD */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
            <h2 className="mb-4 text-sm font-bold text-ink">{t.orderStatus}</h2>
            {status.byStatus.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink-muted">{t.noData}</p>
            ) : (
              <StatusBars rows={status.byStatus} locale={locale} />
            )}
          </div>
          <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
            <h2 className="mb-3 text-sm font-bold text-ink">{t.cod.heading}</h2>
            <dl className="space-y-2 text-sm">
              <Row label={t.cod.out} value={formatMoney(cod.codOut, locale)} />
              <Row label={t.cod.collected} value={formatMoney(cod.codCollected, locale)} tone="success" />
              <Row label={t.cod.remitted} value={formatMoney(cod.codRemitted, locale)} />
              <Row label={t.cod.pending} value={formatMoney(cod.codPending, locale)} tone="pending" />
            </dl>
          </div>
        </div>
      </section>

      {/* Courier performance */}
      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 text-sm font-bold text-ink">{t.courier.heading}</h2>
        {couriers.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">{t.courier.empty}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2 font-semibold">{t.courier.col.courier}</th>
                <th className="px-4 py-2 text-right font-semibold">{t.courier.col.sent}</th>
                <th className="px-4 py-2 text-right font-semibold">{t.courier.col.delivered}</th>
                <th className="px-4 py-2 text-right font-semibold">{t.courier.col.deliveryRate}</th>
                <th className="px-4 py-2 text-right font-semibold">{t.courier.col.rtoRate}</th>
                <th className="px-4 py-2 text-right font-semibold">{t.courier.col.codCollected}</th>
              </tr>
            </thead>
            <tbody>
              {couriers.map((c, i) => (
                <tr key={c.provider} className={i % 2 === 1 ? "bg-surface-2" : undefined}>
                  <td className="px-4 py-2 font-medium capitalize text-ink">{c.provider}</td>
                  <td className="px-4 py-2 text-right font-mono text-ink-muted tnum">{formatNumber(c.sent, locale)}</td>
                  <td className="px-4 py-2 text-right font-mono text-ink tnum">{formatNumber(c.delivered, locale)}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold text-success tnum">{pct(c.deliveryRate)}</td>
                  <td className={`px-4 py-2 text-right font-mono font-semibold tnum ${c.rtoRate > 0.25 ? "text-danger" : "text-ink-muted"}`}>
                    {pct(c.rtoRate)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-ink tnum">{formatMoney(c.codCollected, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Row({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "pending" }) {
  const c = tone === "success" ? "text-success" : tone === "pending" ? "text-st-pending" : "text-ink";
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`font-mono font-semibold tnum ${c}`}>{value}</dd>
    </div>
  );
}
