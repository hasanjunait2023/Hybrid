import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import {
  listReturns,
  getReturnStats,
  type ReturnStatus,
  type ReturnType,
} from "@/lib/admin/returns";
import { timeAgo } from "@/lib/admin/format";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { PageHeader, StatStrip, StatCard } from "../_ui";
import { ReturnStatusChip, ReturnTypeChip } from "./ReturnStatusChip";

// Returns / RTO / Exchange list (echoes products/orders list pages). Status +
// type filter pills reading searchParams, StatStrip with open / RTO queue /
// month refund. Stacked cards on mobile, table ≥ md. Latin numerals (§4.4).
interface ReturnsPageProps {
  searchParams: Promise<{ status?: string; type?: string; q?: string }>;
}

const STATUS_PILL_KEYS = [
  "all",
  "requested",
  "approved",
  "in_transit",
  "received",
  "refunded",
  "completed",
  "rejected",
  "cancelled",
] as const;

const STATUS_VALUES: ReturnStatus[] = [
  "requested",
  "approved",
  "rejected",
  "in_transit",
  "received",
  "refunded",
  "completed",
  "cancelled",
];

export default async function AdminReturnsPage({ searchParams }: ReturnsPageProps) {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const sp = await searchParams;
  const rawStatus = sp.status;
  const status =
    rawStatus && STATUS_VALUES.includes(rawStatus as ReturnStatus)
      ? (rawStatus as ReturnStatus)
      : undefined;
  const type = sp.type === "rto" ? ("rto" as ReturnType) : undefined;
  const query = sp.q?.trim() || undefined;

  const [rows, stats] = await Promise.all([
    listReturns(tenantId, session.userId, { status, type, query }),
    getReturnStats(tenantId, session.userId),
  ]);

  const buildHref = (next: { status?: string; type?: string }) => {
    const params = new URLSearchParams();
    if (next.type === "rto") params.set("type", "rto");
    else if (next.status && next.status !== "all") params.set("status", next.status);
    if (query) params.set("q", query);
    const qs = params.toString();
    return qs ? `/admin/returns?${qs}` : "/admin/returns";
  };

  const activeKey = type === "rto" ? "rto" : (status ?? "all");

  const { locale, d } = await getDict();
  const t = d.admin.returns;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.title}
        subtitle={`${formatNumber(stats.open, locale)} ${t.open} · ${formatNumber(stats.rtoQueue, locale)} ${t.rto}`}
      />

      <StatStrip>
        <StatCard label={t.stats.openReturns} value={formatNumber(stats.open, locale)} tone="pending" />
        <a href="/admin/returns?type=rto" className="contents">
          <StatCard
            label={t.stats.rtoQueue}
            value={formatNumber(stats.rtoQueue, locale)}
            tone={stats.rtoQueue > 0 ? "warning" : "muted"}
            tappable
          />
        </a>
        <StatCard
          label={t.stats.refundedThisMonth}
          value={formatNumber(stats.refundedThisMonth, locale)}
          tone="success"
        />
        <StatCard
          label={t.stats.refundAmount}
          value={formatMoney(stats.refundAmountThisMonth, locale)}
          mono
        />
      </StatStrip>

      {/* Filter pills (status + RTO type), horizontal-scroll */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {STATUS_PILL_KEYS.map((key) => {
          const active = activeKey === key;
          return (
            <a
              key={key}
              href={buildHref({ status: key })}
              className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                active
                  ? "bg-primary text-ink-on-primary"
                  : "border border-border bg-surface text-ink-muted hover:bg-surface-2"
              }`}
            >
              {t.statusPills[key]}
            </a>
          );
        })}
        <a
          href={buildHref({ type: "rto" })}
          className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
            activeKey === "rto"
              ? "bg-warning text-white"
              : "border border-border bg-surface text-warning hover:bg-surface-2"
          }`}
        >
          RTO
        </a>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-ink-muted">
          {t.empty}
        </p>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <a
                  href={`/admin/returns/${r.id}`}
                  className="block rounded-lg border border-border bg-surface p-3 shadow-xs"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-sm font-bold text-ink tnum">
                      #{r.orderNumber}
                    </span>
                    <span className="text-2xs text-ink-subtle">{timeAgo(r.createdAt, locale)}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {r.customerName ?? "—"}
                      </p>
                      {r.customerPhone && (
                        <p className="font-mono text-xs text-ink-muted tnum">{r.customerPhone}</p>
                      )}
                    </div>
                    <span className="font-mono text-base font-bold text-ink tnum">
                      {formatMoney(r.refundAmount, locale)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <ReturnTypeChip type={r.type} lang={locale} />
                    <ReturnStatusChip status={r.status} lang={locale} />
                    <span className="text-2xs text-ink-subtle">
                      {t.reason[r.reason as keyof typeof t.reason] ?? r.reason} · {formatNumber(r.itemCount, locale)} {t.itemsUnit}
                    </span>
                  </div>
                </a>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-3 py-2.5 font-semibold">Order#</th>
                  <th className="px-3 py-2.5 font-semibold">{t.col.customer}</th>
                  <th className="px-3 py-2.5 font-semibold">{t.col.type}</th>
                  <th className="px-3 py-2.5 font-semibold">{t.col.reason}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t.col.items}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t.col.refund}</th>
                  <th className="px-3 py-2.5 font-semibold">{t.col.status}</th>
                  <th className="px-3 py-2.5 font-semibold">{t.col.date}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={i % 2 === 1 ? "bg-surface-2" : undefined}>
                    <td className="px-3 py-2.5">
                      <a
                        href={`/admin/returns/${r.id}`}
                        className="font-mono font-semibold text-ink hover:text-primary hover:underline tnum"
                      >
                        #{r.orderNumber}
                      </a>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-ink">{r.customerName ?? "—"}</div>
                      {r.customerPhone && (
                        <div className="font-mono text-xs text-ink-muted tnum">
                          {r.customerPhone}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <ReturnTypeChip type={r.type} lang={locale} />
                    </td>
                    <td className="px-3 py-2.5 text-ink-muted">
                      {t.reason[r.reason as keyof typeof t.reason] ?? r.reason}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-ink-muted tnum">
                      {formatNumber(r.itemCount, locale)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-ink tnum">
                      {formatMoney(r.refundAmount, locale)}
                    </td>
                    <td className="px-3 py-2.5">
                      <ReturnStatusChip status={r.status} lang={locale} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-muted">{timeAgo(r.createdAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
