import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listPurchaseRequests } from "./actions";
import { timeAgo } from "@/lib/admin/format";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { PageHeader, StatStrip, StatCard } from "../../_ui";

// Purchase requests list — shows all PRs for this wholesaler tenant.
export default async function PurchaseRequestsPage(props: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const searchParams = await props.searchParams;
  const statusFilter = searchParams?.status;

  const requests = await listPurchaseRequests(statusFilter);

  const { locale, d } = await getDict();
  const t = d.admin.wholesale.purchaseRequests;

  const counts = {
    all: requests.length,
    submitted: requests.filter((r) => r.status === "submitted").length,
    quoted: requests.filter((r) => r.status === "quoted").length,
    accepted: requests.filter((r) => r.status === "accepted").length,
    converted: requests.filter((r) => r.status === "converted").length,
  };

  const statuses = ["all", "submitted", "quoted", "accepted", "converted"] as const;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.title}
        subtitle={`${formatNumber(counts.all, locale)} ${d.admin.dashboard.ordersUnit}`}
      />

      <StatStrip>
        <StatCard label={t.stats.all} value={formatNumber(counts.all, locale)} />
        <StatCard label={t.stats.submitted} value={formatNumber(counts.submitted, locale)} tone="pending" />
        <StatCard label={t.stats.quoted} value={formatNumber(counts.quoted, locale)} tone="warning" />
        <StatCard label={t.stats.accepted} value={formatNumber(counts.accepted, locale)} tone="success" />
      </StatStrip>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {statuses.map((s) => {
          const href = s === "all" ? "/admin/wholesale/purchase-requests" : `/admin/wholesale/purchase-requests?status=${s}`;
          const active = s === "all" ? !statusFilter : statusFilter === s;
          return (
            <Link
              key={s}
              href={href}
              className={`inline-flex min-h-[44px] items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-primary text-white"
                  : "bg-surface-2 text-ink-muted hover:bg-surface-3 hover:text-ink"
              }`}
            >
              {t.stats[s as keyof typeof t.stats] ?? s}
            </Link>
          );
        })}
      </div>

      {requests.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-ink-muted">
          {t.empty}
        </p>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {requests.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/wholesale/purchase-requests/${r.id}`}
                  className="block rounded-lg border border-border bg-surface p-3 shadow-xs"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-sm font-bold text-ink tnum">#{r.prNumber}</span>
                    <span className="text-2xs text-ink-subtle">{timeAgo(r.createdAt, locale)}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{r.buyerName ?? "—"}</p>
                      <p className="font-mono text-xs text-ink-muted tnum">{r.buyerPhone}</p>
                    </div>
                    {r.quotedTotal != null && (
                      <span className="font-mono text-base font-bold text-ink tnum">
                        {formatMoney(r.quotedTotal, locale)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs text-ink-muted">{r.itemsCount} {t.table.items}</span>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-medium text-ink-muted">
                      {t.statusLabels[r.status as keyof typeof t.statusLabels] ?? r.status}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2.5 font-semibold">{t.table.pr}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.table.buyer}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.table.status}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t.table.items}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t.table.quotedTotal}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.table.date}</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r, i) => (
                  <tr key={r.id} className={i % 2 === 1 ? "bg-surface-2" : undefined}>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/wholesale/purchase-requests/${r.id}`}
                        className="font-mono font-medium text-ink hover:text-primary hover:underline tnum"
                      >
                        #{r.prNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <div>
                        <p className="text-ink">{r.buyerName ?? "—"}</p>
                        {r.buyerPhone && (
                          <p className="font-mono text-2xs text-ink-muted tnum">{r.buyerPhone}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-medium text-ink-muted">
                        {t.statusLabels[r.status as keyof typeof t.statusLabels] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink tnum">{r.itemsCount}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-ink tnum">
                      {r.quotedTotal != null ? formatMoney(r.quotedTotal, locale) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-muted">{timeAgo(r.createdAt, locale)}</td>
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
