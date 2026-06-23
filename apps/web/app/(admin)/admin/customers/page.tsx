import { redirect } from "next/navigation";
import { formatBdtLatin } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listCustomers } from "@/lib/admin/customers";
import { timeAgoBn } from "@/lib/admin/format";
import { CustomerSearch } from "./CustomerSearch";

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

  const customers = await listCustomers(tenantId, session.userId, { query, sort });

  return (
    <div lang="en" className="space-y-4">
      <h1 className="text-2xl font-bold text-ink">গ্রাহক</h1>
      <CustomerSearch defaultValue={query ?? ""} sort={sort} />

      {customers.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-ink-muted">
          কোনো গ্রাহক নেই।
        </p>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {customers.map((c) => (
              <li key={c.id}>
                <a
                  href={`/admin/customers/${c.id}`}
                  className="block rounded-lg border border-border bg-surface p-3 shadow-xs"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-ink">{c.name ?? "—"}</span>
                    <span className="font-mono text-sm font-bold text-ink tnum">
                      {formatBdtLatin(c.totalSpent)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="font-mono text-xs text-ink-muted tnum">{c.phone}</span>
                    <span className="text-2xs text-ink-subtle">
                      {c.ordersCount} অর্ডার · {c.lastOrderAt ? timeAgoBn(c.lastOrderAt) : "—"}
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
                  <th className="px-4 py-2.5 font-semibold">নাম</th>
                  <th className="px-4 py-2.5 font-semibold">ফোন</th>
                  <th className="px-4 py-2.5 text-right font-semibold">অর্ডার</th>
                  <th className="px-4 py-2.5 text-right font-semibold">মোট খরচ</th>
                  <th className="px-4 py-2.5 font-semibold">শেষ অর্ডার</th>
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
                    <td className="px-4 py-2.5 text-right font-mono text-ink tnum">{c.ordersCount}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-ink tnum">
                      {formatBdtLatin(c.totalSpent)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-muted">
                      {c.lastOrderAt ? timeAgoBn(c.lastOrderAt) : "—"}
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
