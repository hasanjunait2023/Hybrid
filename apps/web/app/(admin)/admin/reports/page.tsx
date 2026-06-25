import { redirect } from "next/navigation";
import { formatBdtLatin } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
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
import { PageHeader, StatStrip, StatCard } from "../_ui";
import { TrendChart, StatusBars } from "../DashboardCharts";

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
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

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

  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div lang="en" className="space-y-5">
      <PageHeader title="রিপোর্ট ও আয়-ব্যয়" subtitle={`${range.from} — ${range.to}`} />

      {/* Range presets */}
      <div className="flex gap-2">
        {[
          { r: "7", bn: "৭ দিন" },
          { r: "30", bn: "৩০ দিন" },
          { r: "90", bn: "৯০ দিন" },
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
              {p.bn}
            </a>
          );
        })}
      </div>

      <StatStrip>
        <StatCard label="মোট বিক্রি" value={formatBdtLatin(sales.totalRevenue)} mono />
        <StatCard label="অর্ডার" value={String(sales.totalOrders)} sub={`গড় ${formatBdtLatin(sales.avgOrderValue)}`} />
        <StatCard
          label="গ্রস প্রফিট"
          value={profit.hasCost ? formatBdtLatin(profit.grossProfit) : "—"}
          sub={profit.hasCost ? `মার্জিন ${pct(profit.margin)}` : "কস্ট প্রাইস সেট করুন"}
          tone={profit.hasCost ? "success" : "muted"}
          mono={profit.hasCost}
        />
        <StatCard
          label="RTO রেট"
          value={pct(status.rtoRate)}
          sub={`ডেলিভারি ${pct(status.deliveryRate)}`}
          tone={status.rtoRate > 0.25 ? "danger" : "default"}
        />
      </StatStrip>

      {/* Sales trend */}
      <section className="rounded-lg border border-border bg-surface p-4 shadow-xs">
        <h2 className="mb-4 text-sm font-bold text-ink">বিক্রির ধারা</h2>
        <TrendChart series={sales.days} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {/* Top products */}
        <div className="overflow-hidden rounded-lg border border-border bg-surface lg:col-span-2">
          <h2 className="border-b border-border px-4 py-3 text-sm font-bold text-ink">শীর্ষ পণ্য</h2>
          {top.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">কোনো বিক্রি নেই।</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2 font-semibold">পণ্য</th>
                  <th className="px-4 py-2 text-right font-semibold">ইউনিট</th>
                  <th className="px-4 py-2 text-right font-semibold">বিক্রি</th>
                </tr>
              </thead>
              <tbody>
                {top.map((p, i) => (
                  <tr key={(p.productId ?? "x") + i} className={i % 2 === 1 ? "bg-surface-2" : undefined}>
                    <td className="px-4 py-2 text-ink">{p.title}</td>
                    <td className="px-4 py-2 text-right font-mono text-ink-muted tnum">{p.units}</td>
                    <td className="px-4 py-2 text-right font-mono font-semibold text-ink tnum">
                      {formatBdtLatin(p.revenue)}
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
            <h2 className="mb-4 text-sm font-bold text-ink">অর্ডার স্ট্যাটাস</h2>
            {status.byStatus.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink-muted">ডেটা নেই।</p>
            ) : (
              <StatusBars rows={status.byStatus} />
            )}
          </div>
          <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
            <h2 className="mb-3 text-sm font-bold text-ink">COD হিসাব</h2>
            <dl className="space-y-2 text-sm">
              <Row label="বকেয়া (পথে)" value={formatBdtLatin(cod.codOut)} />
              <Row label="সংগৃহীত" value={formatBdtLatin(cod.codCollected)} tone="success" />
              <Row label="রেমিট হয়েছে" value={formatBdtLatin(cod.codRemitted)} />
              <Row label="রেমিট বাকি" value={formatBdtLatin(cod.codPending)} tone="pending" />
            </dl>
          </div>
        </div>
      </section>

      {/* Courier performance */}
      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 text-sm font-bold text-ink">কুরিয়ার পারফরম্যান্স</h2>
        {couriers.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">এখনো কোনো চালান নেই।</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2 font-semibold">কুরিয়ার</th>
                <th className="px-4 py-2 text-right font-semibold">পাঠানো</th>
                <th className="px-4 py-2 text-right font-semibold">ডেলিভার্ড</th>
                <th className="px-4 py-2 text-right font-semibold">ডেলিভারি রেট</th>
                <th className="px-4 py-2 text-right font-semibold">RTO রেট</th>
                <th className="px-4 py-2 text-right font-semibold">COD সংগ্রহ</th>
              </tr>
            </thead>
            <tbody>
              {couriers.map((c, i) => (
                <tr key={c.provider} className={i % 2 === 1 ? "bg-surface-2" : undefined}>
                  <td className="px-4 py-2 font-medium capitalize text-ink">{c.provider}</td>
                  <td className="px-4 py-2 text-right font-mono text-ink-muted tnum">{c.sent}</td>
                  <td className="px-4 py-2 text-right font-mono text-ink tnum">{c.delivered}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold text-success tnum">{pct(c.deliveryRate)}</td>
                  <td className={`px-4 py-2 text-right font-mono font-semibold tnum ${c.rtoRate > 0.25 ? "text-danger" : "text-ink-muted"}`}>
                    {pct(c.rtoRate)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-ink tnum">{formatBdtLatin(c.codCollected)}</td>
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
