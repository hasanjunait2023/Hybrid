import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getDiscountPerformance } from "@/lib/admin/discounts";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { PageHeader } from "../../_ui";

// Discount performance report — per-code orders, discount given, and revenue
// driven. Operator-facing (Latin numerals). Read-only.
export const dynamic = "force-dynamic";

export default async function DiscountReportPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const rows = await getDiscountPerformance(tenantId, session.userId);
  const { locale } = await getDict();

  const totals = rows.reduce(
    (a, r) => ({
      orders: a.orders + r.ordersCount,
      discount: a.discount + r.totalDiscount,
      revenue: a.revenue + r.revenue,
    }),
    { orders: 0, discount: 0, revenue: 0 },
  );

  return (
    <div className="space-y-4">
      <a href="/admin/discounts" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← ডিসকাউন্ট
      </a>
      <PageHeader title="ডিসকাউন্ট রিপোর্ট" subtitle="প্রতিটি কোডের পারফরম্যান্স" />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-ink-muted">
          এখনো কোনো কোড ব্যবহার হয়নি।
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-3 py-2 font-semibold">কোড</th>
                <th className="px-3 py-2 text-right font-semibold">অর্ডার</th>
                <th className="px-3 py-2 text-right font-semibold">ছাড় দেওয়া</th>
                <th className="px-3 py-2 text-right font-semibold">আয়</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-b border-border">
                  <td className="px-3 py-2 font-mono font-medium uppercase text-ink">{r.code}</td>
                  <td className="px-3 py-2 text-right font-mono tnum">
                    {formatNumber(r.ordersCount, locale)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tnum text-danger">
                    −{formatMoney(r.totalDiscount, locale)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold tnum">
                    {formatMoney(r.revenue, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-strong font-semibold">
                <td className="px-3 py-2">মোট</td>
                <td className="px-3 py-2 text-right font-mono tnum">
                  {formatNumber(totals.orders, locale)}
                </td>
                <td className="px-3 py-2 text-right font-mono tnum text-danger">
                  −{formatMoney(totals.discount, locale)}
                </td>
                <td className="px-3 py-2 text-right font-mono tnum">
                  {formatMoney(totals.revenue, locale)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
