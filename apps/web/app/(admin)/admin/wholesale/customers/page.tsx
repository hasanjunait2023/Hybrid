import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { listB2BCustomers, getB2BCustomerStats } from "@/lib/admin/wholesale";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { PageHeader, StatStrip, StatCard } from "../../_ui";

// B2B customers list — retailers, distributors, wholesalers.
export default async function WholesaleCustomersPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const [customers, stats] = await Promise.all([
    listB2BCustomers(tenantId, session.userId),
    getB2BCustomerStats(tenantId, session.userId),
  ]);

  const { locale, d } = await getDict();
  const t = d.admin.wholesale.customers;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.title}
        subtitle={`${formatNumber(stats.total, locale)} ${d.admin.customers.customersUnit} · ${formatNumber(stats.verified, locale)} ${t.stats.verified}`}
      />

      <StatStrip>
        <StatCard label={t.stats.total} value={formatNumber(stats.total, locale)} />
        <StatCard label={t.stats.verified} value={formatNumber(stats.verified, locale)} tone="success" />
        <StatCard label={t.stats.totalCredit} value={formatMoney(stats.totalCreditLimit, locale)} mono />
        <StatCard label={t.stats.totalDue} value={formatMoney(stats.totalDue, locale)} tone={stats.totalDue > 0 ? "warning" : "muted"} mono />
      </StatStrip>

      {customers.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-ink-muted">
          {t.empty}
        </p>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {customers.map((c) => (
              <li key={c.id}>
                <div className="rounded-lg border border-border bg-surface p-3 shadow-xs">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-ink">{c.businessName ?? c.name ?? "—"}</span>
                    <span className="font-mono text-sm font-bold text-ink tnum">
                      {formatMoney(c.totalSpent, locale)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="font-mono text-xs text-ink-muted tnum">{c.phone}</span>
                    <span className="text-2xs text-ink-subtle">{t.types[c.customerType as keyof typeof t.types] ?? c.customerType}</span>
                  </div>
                  {c.creditLimit > 0 && (
                    <div className="mt-1 flex gap-3 text-2xs text-ink-subtle">
                      <span>{t.table.creditLimit}: {formatMoney(c.creditLimit, locale)}</span>
                      <span>{t.table.currentDue}: {formatMoney(c.currentDue, locale)}</span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2.5 font-semibold">{t.table.name}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.table.businessName}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.table.phone}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.table.type}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t.table.creditLimit}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t.table.currentDue}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t.table.orders}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t.table.spent}</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c, i) => (
                  <tr key={c.id} className={i % 2 === 1 ? "bg-surface-2" : undefined}>
                    <td className="px-4 py-2.5 font-medium text-ink">{c.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-ink-muted">{c.businessName ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-ink-muted tnum">{c.phone}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-medium text-ink-muted">
                        {t.types[c.customerType as keyof typeof t.types] ?? c.customerType}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink tnum">
                      {formatMoney(c.creditLimit, locale)}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono tnum ${c.currentDue > 0 ? "text-warning" : "text-ink-muted"}`}>
                      {formatMoney(c.currentDue, locale)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-muted tnum">
                      {formatNumber(c.ordersCount, locale)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-ink tnum">
                      {formatMoney(c.totalSpent, locale)}
                    </td>
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
