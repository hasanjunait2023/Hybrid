import { redirect } from "next/navigation";
import { formatBdtLatin, StatusBadge } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getDashboard } from "@/lib/admin/dashboard";
import { timeAgoBn } from "@/lib/admin/format";

// Admin dashboard (DESIGN §P2.3). Data-dense but calm; hierarchy top→bottom is
// "what needs action" before vanity metrics. Latin numerals + tabular-nums
// (§4.4), no marigold, no charts. Asia/Dhaka day boundary (lib/admin/dashboard).
export default async function AdminDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const data = await getDashboard(tenantId, session.userId);
  const delta = data.todayOrders - data.yesterdayOrders;

  return (
    <div lang="en" className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">সুপ্রভাত</h1>
        <p className="text-sm text-ink-muted">{todayLabel()}</p>
      </div>

      {/* Metric cards — 2-col mobile, 4-col ≥ md. Order = operational urgency. */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          label="আজকের অর্ডার"
          value={String(data.todayOrders)}
          sub={delta >= 0 ? `গতকালের চেয়ে +${delta}` : `গতকালের চেয়ে ${delta}`}
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

      {/* Recent orders */}
      <section className="rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-bold text-ink">সাম্প্রতিক অর্ডার</h2>
          <a href="/admin/orders" className="text-xs font-semibold text-primary hover:underline">
            সব অর্ডার দেখুন →
          </a>
        </div>
        {data.recentOrders.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">এখনো কোনো অর্ডার নেই।</p>
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
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "pending" | "warning" | "muted";
  mono?: boolean;
  tappable?: boolean;
}) {
  const valueTone =
    tone === "pending"
      ? "text-st-pending"
      : tone === "warning"
        ? "text-warning"
        : tone === "muted"
          ? "text-ink-subtle"
          : "text-ink";
  return (
    <div
      className={`rounded-lg border border-border bg-surface p-4 shadow-xs ${tappable ? "transition-shadow hover:shadow-md" : ""}`}
    >
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold leading-none ${valueTone} ${mono ? "font-mono tnum" : "tnum"}`}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-2xs text-ink-subtle">{sub}</p>}
    </div>
  );
}
