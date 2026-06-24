import { redirect } from "next/navigation";
import { formatBdtLatin, StatusBadge } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getDashboard } from "@/lib/admin/dashboard";
import { timeAgoBn } from "@/lib/admin/format";
import { TrendChart, StatusBars } from "./DashboardCharts";

// Admin dashboard (DESIGN §P2.3), reference layout: KPI row → trend chart +
// month highlight → recent-orders table + status panel. Data-dense but calm;
// hierarchy is "what needs action" first. Hybrid indigo brand, light, Latin
// numerals + tabular-nums (§4.4). Asia/Dhaka boundary (lib/admin/dashboard).
export default async function AdminDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const data = await getDashboard(tenantId, session.userId);
  const delta = data.todayOrders - data.yesterdayOrders;
  const codTotal = data.codCollectedAmount + data.codPendingAmount;
  const codPct = codTotal > 0 ? Math.round((data.codCollectedAmount / codTotal) * 100) : 0;

  return (
    <div lang="en" className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">সুপ্রভাত</h1>
          <p className="text-sm text-ink-muted">{todayLabel()}</p>
        </div>
        <a
          href="/admin/orders/new"
          className="hidden rounded-md bg-primary px-3 py-2 text-sm font-semibold text-ink-on-primary shadow-xs hover:bg-primary-hover sm:inline-block"
        >
          + নতুন অর্ডার
        </a>
      </div>

      {/* KPI row — 2-col mobile, 4-col ≥ md. Order = operational urgency. */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          label="আজকের অর্ডার"
          value={String(data.todayOrders)}
          sub={delta >= 0 ? `গতকালের চেয়ে +${delta}` : `গতকালের চেয়ে ${delta}`}
          deltaUp={delta >= 0}
        />
        <MetricCard label="আজকের বিক্রি" value={formatBdtLatin(data.todayRevenue)} mono />
        <a href="/admin/orders?cod=pending" className="contents">
          <MetricCard
            label="COD বকেয়া"
            value={formatBdtLatin(data.codPendingAmount)}
            sub={`${data.codPendingCount} টি অর্ডার`}
            tone="pending"
            mono
            tappable
          />
        </a>
        <a href="/admin/products?status=active" className="contents">
          <MetricCard
            label="কম স্টক"
            value={String(data.lowStockCount)}
            tone={data.lowStockCount > 0 ? "warning" : "muted"}
            tappable
          />
        </a>
      </section>

      {/* Action-needed strip (only if non-zero) */}
      {data.pendingConfirmCount > 0 && (
        <a
          href="/admin/orders?status=pending"
          className="flex items-center justify-between rounded-lg bg-warning-weak px-4 py-3 text-sm font-semibold text-warning"
        >
          <span>{data.pendingConfirmCount} টি অর্ডার কনফার্ম করা বাকি</span>
          <span aria-hidden>→</span>
        </a>
      )}

      {/* Trend chart (2/3) + month-revenue highlight (1/3) */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4 shadow-xs lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-ink">বিক্রির ধারা</h2>
              <p className="text-xs text-ink-subtle">গত ১৪ দিন</p>
            </div>
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-muted">
              ১৪ দিন
            </span>
          </div>
          <TrendChart series={data.revenueSeries} />
        </div>

        {/* Month highlight — the reference's hero stat card, Hybrid indigo. */}
        <div className="flex flex-col justify-between rounded-lg bg-primary p-5 text-ink-on-primary shadow-sm">
          <div>
            <p className="text-xs font-medium opacity-80">এই মাসের বিক্রি</p>
            <p className="mt-1 font-mono text-3xl font-bold leading-none tnum">
              {formatBdtLatin(data.monthRevenue)}
            </p>
          </div>
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="opacity-80">COD সংগৃহীত</span>
              <span className="font-mono font-semibold tnum">
                {formatBdtLatin(data.codCollectedAmount)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white" style={{ width: `${codPct}%` }} />
            </div>
            <div className="flex items-center justify-between text-2xs opacity-80">
              <span>{codPct}% সংগৃহীত</span>
              <span>বকেয়া {formatBdtLatin(data.codPendingAmount)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Recent orders table (2/3) + status panel (1/3) */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="overflow-hidden rounded-lg border border-border bg-surface lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-bold text-ink">সাম্প্রতিক অর্ডার</h2>
            <a href="/admin/orders" className="text-xs font-semibold text-primary hover:underline">
              সব অর্ডার দেখুন →
            </a>
          </div>
          {data.recentOrders.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-muted">এখনো কোনো অর্ডার নেই।</p>
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
                      {timeAgoBn(o.placedAt)}
                    </span>
                    <span className="font-mono text-sm font-semibold text-ink tnum">
                      {formatBdtLatin(o.grandTotal)}
                    </span>
                    <StatusBadge kind="fulfillment" value={o.fulfillmentStatus} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
          <h2 className="mb-4 text-sm font-bold text-ink">অর্ডার স্ট্যাটাস</h2>
          {data.statusBreakdown.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">কোনো ডেটা নেই।</p>
          ) : (
            <StatusBars rows={data.statusBreakdown} />
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

function MetricCard({
  label,
  value,
  sub,
  tone = "default",
  mono = false,
  tappable = false,
  deltaUp,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "pending" | "warning" | "muted";
  mono?: boolean;
  tappable?: boolean;
  deltaUp?: boolean;
}) {
  const valueTone =
    tone === "pending"
      ? "text-st-pending"
      : tone === "warning"
        ? "text-warning"
        : tone === "muted"
          ? "text-ink-subtle"
          : "text-ink";
  const subTone =
    deltaUp === undefined
      ? "text-ink-subtle"
      : deltaUp
        ? "text-success"
        : "text-danger";
  return (
    <div
      className={`rounded-lg border border-border bg-surface p-4 shadow-xs ${tappable ? "transition-shadow hover:shadow-md" : ""}`}
    >
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold leading-none ${valueTone} ${mono ? "font-mono tnum" : "tnum"}`}>
        {value}
      </p>
      {sub && <p className={`mt-1.5 text-2xs ${subTone}`}>{sub}</p>}
    </div>
  );
}
