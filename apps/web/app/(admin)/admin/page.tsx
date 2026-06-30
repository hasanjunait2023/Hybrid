import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { StatusBadge } from "@hybrid/ui";
import { getActiveTenantId } from "@/lib/admin/data";
import { getDashboard } from "@/lib/admin/dashboard";
import { timeAgo } from "@/lib/admin/format";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { TrendChart, StatusBars } from "./DashboardCharts";
import { WeeklyComparison, TopProducts, ActivityFeed } from "./DashboardWidgets";
import { MobileQuickStats } from "./MobileQuickStats";
import { PageHeader, StatStrip, StatCard } from "./_ui";

// Admin dashboard (DESIGN §P2.3), reference layout: KPI row → trend chart +
// month highlight → recent-orders table + status panel. Data-dense but calm;
// hierarchy is "what needs action" first. Hybrid indigo brand, light, Latin
// numerals + tabular-nums (§4.4). Asia/Dhaka boundary (lib/admin/dashboard).
export default async function AdminDashboardPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const { locale, d } = await getDict();
  const t = d.admin.dashboard;
  const data = await getDashboard(tenantId, session.userId);
  const delta = data.todayOrders - data.yesterdayOrders;
  const deltaStr = `${delta >= 0 ? "+" : "−"}${formatNumber(Math.abs(delta), locale)}`;
  const codTotal = data.codCollectedAmount + data.codPendingAmount;
  const codPct = codTotal > 0 ? Math.round((data.codCollectedAmount / codTotal) * 100) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.greeting}
        subtitle={todayLabel()}
        action={
          <a
            href="/admin/orders/new"
            className="hidden rounded-md bg-primary px-3 py-2 text-sm font-semibold text-ink-on-primary shadow-xs hover:bg-primary-hover sm:inline-block"
          >
            + {t.newOrder}
          </a>
        }
      />

      {/* Mobile-only horizontal stat strip (snap-scrollable cards) */}
      <MobileQuickStats
        todayOrders={data.todayOrders}
        todayRevenue={data.todayRevenue}
        pendingConfirm={data.pendingConfirmCount}
        codPending={data.codPendingAmount}
        lowStock={data.lowStockCount}
        locale={locale}
      />

      {/* KPI row — order = operational urgency. */}
      <StatStrip>
        <StatCard
          label={t.todayOrders}
          value={formatNumber(data.todayOrders, locale)}
          sub={`${t.vsYesterday} ${deltaStr}`}
          deltaUp={delta >= 0}
        />
        <StatCard label={t.todaySales} value={formatMoney(data.todayRevenue, locale)} mono />
        <a href="/admin/orders?cod=pending" className="contents">
          <StatCard
            label={t.codDue}
            value={formatMoney(data.codPendingAmount, locale)}
            sub={`${formatNumber(data.codPendingCount, locale)} ${t.ordersUnit}`}
            tone="pending"
            mono
            tappable
          />
        </a>
        <a href="/admin/products?status=active" className="contents">
          <StatCard
            label={t.lowStock}
            value={formatNumber(data.lowStockCount, locale)}
            tone={data.lowStockCount > 0 ? "warning" : "muted"}
            tappable
          />
        </a>
      </StatStrip>

      {/* Action-needed strip (only if non-zero) */}
      {data.pendingConfirmCount > 0 && (
        <a
          href="/admin/orders?status=pending"
          className="flex items-center justify-between rounded-lg bg-warning-weak px-4 py-3 text-sm font-semibold text-warning"
        >
          <span>{formatNumber(data.pendingConfirmCount, locale)} {t.awaitingConfirm}</span>
          <span aria-hidden>→</span>
        </a>
      )}

      {/* Trend chart (2/3) + month-revenue highlight (1/3) */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4 shadow-xs lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-ink">{t.salesTrend}</h2>
              <p className="text-xs text-ink-subtle">{t.last14days}</p>
            </div>
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-muted">
              {t.days14}
            </span>
          </div>
          <TrendChart series={data.revenueSeries} locale={locale} ordersUnit={t.ordersUnit} />
        </div>

        {/* Month highlight — the reference's hero stat card, Hybrid indigo. */}
        <div className="flex flex-col justify-between rounded-lg bg-primary p-5 text-ink-on-primary shadow-sm">
          <div>
            <p className="text-xs font-medium opacity-80">{t.monthSales}</p>
            <p className="mt-1 font-mono text-3xl font-bold leading-none tnum">
              {formatMoney(data.monthRevenue, locale)}
            </p>
          </div>
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="opacity-80">{t.codCollected}</span>
              <span className="font-mono font-semibold tnum">
                {formatMoney(data.codCollectedAmount, locale)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white" style={{ width: `${codPct}%` }} />
            </div>
            <div className="flex items-center justify-between text-2xs opacity-80">
              <span>{formatNumber(codPct, locale)}% {t.collected}</span>
              <span>{t.due} {formatMoney(data.codPendingAmount, locale)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Weekly comparison + Top products + Recent activity */}
      <section className="grid gap-4 lg:grid-cols-3">
        <WeeklyComparison
          thisWeekOrders={data.thisWeekOrders}
          thisWeekRevenue={data.thisWeekRevenue}
          lastWeekOrders={data.lastWeekOrders}
          lastWeekRevenue={data.lastWeekRevenue}
          locale={locale}
          ordersLabel={t.ordersUnit}
        />
        <TopProducts
          products={data.topProducts}
          locale={locale}
          seeAllHref="/admin/products?sort=top"
        />
        <ActivityFeed items={data.recentActivity} locale={locale} />
      </section>

      {/* Recent orders table (2/3) + status panel (1/3) */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="overflow-hidden rounded-lg border border-border bg-surface lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-bold text-ink">{t.recentOrders}</h2>
            <a href="/admin/orders" className="text-xs font-semibold text-primary hover:underline">
              {t.viewAllOrders} →
            </a>
          </div>
          {data.recentOrders.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-muted">{t.noOrders}</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.recentOrders.map((o) => (
                <li key={o.id}>
                  <a
                    href={`/admin/orders/${o.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
                  >
                    <span className="font-mono text-sm font-semibold text-ink tnum">
                      #{o.orderNumber}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">
                      {o.customerName ?? "—"}
                    </span>
                    <span className="hidden text-xs text-ink-subtle sm:inline">
                      {timeAgo(o.placedAt, locale)}
                    </span>
                    <span className="font-mono text-sm font-semibold text-ink tnum">
                      {formatMoney(o.grandTotal, locale)}
                    </span>
                    <StatusBadge kind="fulfillment" value={o.fulfillmentStatus} lang={locale} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
          <h2 className="mb-4 text-sm font-bold text-ink">{t.orderStatus}</h2>
          {data.statusBreakdown.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t.noData}</p>
          ) : (
            <StatusBars rows={data.statusBreakdown} locale={locale} />
          )}
        </div>
      </section>
    </div>
  );
}

function todayLabel(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

