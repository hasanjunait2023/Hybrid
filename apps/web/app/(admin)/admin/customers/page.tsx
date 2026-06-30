import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listCustomers, getCustomerStats } from "@/lib/admin/customers";
import { timeAgo } from "@/lib/admin/format";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { CustomerSearch } from "./CustomerSearch";
import { PageHeader, StatStrip, StatCard } from "../_ui";

// Customers list (DESIGN §P5). name · phone · orders · total spent · last-order ·
// tags. Search by name/phone; sort by spend / recency. Stacked cards on mobile.
interface CustomersPageProps {
  searchParams: Promise<{ q?: string; sort?: string }>;
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const sp = await searchParams;
  const query = sp.q?.trim() || undefined;
  const sort = sp.sort === "spend" ? "spend" : "recent";

  const [customers, stats] = await Promise.all([
    listCustomers(tenantId, session.userId, { query, sort }),
    getCustomerStats(tenantId, session.userId),
  ]);

  const { locale, d } = await getDict();
  const t = d.admin.customers;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.title}
        subtitle={`${formatNumber(stats.total, locale)} ${t.customersUnit} · ${formatNumber(stats.repeat, locale)} ${t.repeatUnit}`}
        action={
          <div className="flex items-center gap-2">
            <a
              href="/admin/customers/export"
              className="hidden h-11 items-center rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-2 sm:inline-flex"
            >
              {t.export}
            </a>
            <a
              href="/admin/customers/blacklist"
              className="inline-flex h-11 items-center rounded-md border border-border-strong px-4 text-sm font-semibold text-ink hover:bg-surface-2"
            >
              {t.blockedNumbers}
            </a>
          </div>
        }
      />

      <StatStrip>
        <StatCard label={t.stats.totalCustomers} value={formatNumber(stats.total, locale)} />
        <StatCard label={t.stats.repeatCustomers} value={formatNumber(stats.repeat, locale)} tone="success" />
        <StatCard label={t.stats.totalRevenue} value={formatMoney(stats.totalRevenue, locale)} mono />
        <StatCard label={t.stats.avgSpend} value={formatMoney(stats.avgSpend, locale)} mono />
      </StatStrip>

      <CustomerSearch defaultValue={query ?? ""} sort={sort} />

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
                <a
                  href={`/admin/customers/${c.id}`}
                  className="block min-h-[44px] rounded-lg border border-border bg-surface p-3 shadow-xs"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-ink">{c.name ?? "—"}</span>
                    <span className="font-mono text-sm font-bold text-ink tnum">
                      {formatMoney(c.totalSpent, locale)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                    <span className="font-mono text-xs text-ink-muted tnum">{c.phone}</span>
                    <span className="text-2xs text-ink-subtle">
                      {formatNumber(c.ordersCount, locale)} {t.ordersUnit} · {c.lastOrderAt ? timeAgo(c.lastOrderAt, locale) : "—"}
                    </span>
                  </div>
                  {c.tags.length > 0 && <Tags tags={c.tags} />}
                </a>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2.5 font-semibold">{t.table.name}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.table.phone}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t.table.orders}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t.table.totalSpent}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.table.lastOrder}</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c, i) => (
                  <tr key={c.id} className={i % 2 === 1 ? "bg-surface-2" : undefined}>
                    <td className="px-4 py-2.5">
                      <a
                        href={`/admin/customers/${c.id}`}
                        className="font-medium text-ink hover:text-primary hover:underline"
                      >
                        {c.name ?? "—"}
                      </a>
                      {c.tags.length > 0 && <Tags tags={c.tags} />}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-ink-muted tnum">{c.phone}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink tnum">{formatNumber(c.ordersCount, locale)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-ink tnum">
                      {formatMoney(c.totalSpent, locale)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-muted">
                      {c.lastOrderAt ? timeAgo(c.lastOrderAt, locale) : "—"}
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

function Tags({ tags }: { tags: string[] }) {
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t}
          className={`rounded-full px-1.5 py-0.5 text-2xs font-medium ${
            isRiskTag(t) ? "bg-danger-weak text-danger" : "bg-surface-2 text-ink-muted"
          }`}
        >
          {t}
        </span>
      ))}
    </span>
  );
}

function isRiskTag(tag: string): boolean {
  return tag.includes("ফেরত") || tag.toLowerCase().includes("risk");
}
