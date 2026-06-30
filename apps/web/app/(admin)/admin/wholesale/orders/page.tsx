import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { listWholesaleOrders, getWholesaleOrderCounts } from "@/lib/admin/wholesale";
import { timeAgo } from "@/lib/admin/format";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { PageHeader, StatStrip, StatCard } from "../../_ui";

// Wholesale orders list — filters order_mode='wholesale'.
export default async function WholesaleOrdersPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const [orders, counts] = await Promise.all([
    listWholesaleOrders(tenantId, session.userId),
    getWholesaleOrderCounts(tenantId, session.userId),
  ]);

  const { locale, d } = await getDict();
  const t = d.admin.wholesale.orders;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.title}
        subtitle={`${formatNumber(counts.all, locale)} ${d.admin.dashboard.ordersUnit}`}
      />

      <StatStrip>
        <StatCard label={t.stats.all} value={formatNumber(counts.all, locale)} />
        <StatCard label={t.stats.pending} value={formatNumber(counts.pending, locale)} tone="pending" />
        <StatCard label={t.stats.confirmed} value={formatNumber(counts.confirmed, locale)} tone="success" />
        <StatCard label={t.stats.delivered} value={formatNumber(counts.delivered, locale)} tone="muted" />
      </StatStrip>

      {orders.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-ink-muted">
          {t.empty}
        </p>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {orders.map((o) => (
              <li key={o.id}>
                <a
                  href={`/admin/orders/${o.id}`}
                  className="block rounded-lg border border-border bg-surface p-3 shadow-xs"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-sm font-bold text-ink tnum">#{o.orderNumber}</span>
                    <span className="text-2xs text-ink-subtle">{timeAgo(o.placedAt, locale)}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{o.customerName ?? "—"}</p>
                      <p className="font-mono text-xs text-ink-muted tnum">{o.customerPhone}</p>
                    </div>
                    <span className="font-mono text-base font-bold text-ink tnum">
                      {formatMoney(o.grandTotal, locale)}
                    </span>
                  </div>
                  {o.poReference && (
                    <p className="mt-1 text-2xs text-ink-subtle">{t.table.poRef}: {o.poReference}</p>
                  )}
                </a>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2.5 font-semibold">{t.table.order}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.table.customer}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t.table.total}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.table.status}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.table.payment}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.table.poRef}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.table.date}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => (
                  <tr key={o.id} className={i % 2 === 1 ? "bg-surface-2" : undefined}>
                    <td className="px-4 py-2.5">
                      <a
                        href={`/admin/orders/${o.id}`}
                        className="font-mono font-medium text-ink hover:text-primary hover:underline tnum"
                      >
                        #{o.orderNumber}
                      </a>
                    </td>
                    <td className="px-4 py-2.5">
                      <div>
                        <p className="text-ink">{o.customerName ?? "—"}</p>
                        {o.customerPhone && (
                          <p className="font-mono text-2xs text-ink-muted tnum">{o.customerPhone}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-ink tnum">
                      {formatMoney(o.grandTotal, locale)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-medium text-ink-muted">
                        {o.fulfillmentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-muted">{o.paymentStatus}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-muted tnum">{o.poReference ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-ink-muted">{timeAgo(o.placedAt, locale)}</td>
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
