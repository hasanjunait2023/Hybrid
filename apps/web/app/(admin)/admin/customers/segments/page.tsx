import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listSegments, getSegmentCustomers } from "@/lib/admin/segments";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { CreateSegmentForm, DeleteSegment } from "./SegmentControls";

// Customer segments — named, reusable filters (min orders / min spend / tag)
// with live match counts and a per-segment customer view.
export const dynamic = "force-dynamic";

export default async function SegmentsPage(props: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const viewId = (await props.searchParams).view;
  const [segments, view] = await Promise.all([
    listSegments(tenantId, session.userId),
    viewId ? getSegmentCustomers(tenantId, session.userId, viewId) : Promise.resolve(null),
  ]);
  const { locale } = await getDict();

  return (
    <div className="space-y-5">
      <a href="/admin/customers" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← কাস্টমার
      </a>
      <div>
        <h1 className="text-xl font-bold text-ink">সেগমেন্ট</h1>
        <p className="text-sm text-ink-muted">নাম দিয়ে সেভ করা কাস্টমার ফিল্টার।</p>
      </div>

      <CreateSegmentForm />

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-3 py-2 font-semibold">নাম</th>
              <th className="px-3 py-2 font-semibold">শর্ত</th>
              <th className="px-3 py-2 text-right font-semibold">মিল</th>
              <th className="px-3 py-2 text-right font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {segments.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-ink-muted">
                  কোনো সেগমেন্ট নেই।
                </td>
              </tr>
            ) : (
              segments.map((s) => (
                <tr key={s.id} className="border-b border-border">
                  <td className="px-3 py-2 font-medium text-ink">{s.name}</td>
                  <td className="px-3 py-2 text-xs text-ink-muted">
                    ≥{formatNumber(s.minOrders, locale)} অর্ডার · ≥{formatMoney(s.minSpent, locale)}
                    {s.tag ? ` · #${s.tag}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tnum">
                    {formatNumber(s.matchCount, locale)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex items-center gap-3">
                      <Link
                        href={`/admin/customers/segments?view=${s.id}`}
                        className="text-2xs font-semibold text-primary hover:underline"
                      >
                        দেখুন
                      </Link>
                      <DeleteSegment id={s.id} />
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Selected segment's customers */}
      {view && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-ink">
            {view.name} — {formatNumber(view.customers.length, locale)} জন
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-3 py-2 font-semibold">নাম</th>
                  <th className="px-3 py-2 font-semibold">ফোন</th>
                  <th className="px-3 py-2 text-right font-semibold">অর্ডার</th>
                  <th className="px-3 py-2 text-right font-semibold">মোট খরচ</th>
                </tr>
              </thead>
              <tbody>
                {view.customers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-ink-muted">
                      কোনো কাস্টমার মেলেনি।
                    </td>
                  </tr>
                ) : (
                  view.customers.map((c) => (
                    <tr key={c.id} className="border-b border-border">
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/customers/${c.id}`}
                          className="font-medium text-ink hover:text-primary hover:underline"
                        >
                          {c.name ?? "—"}
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-ink-muted tnum">
                        {c.phone ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tnum">
                        {formatNumber(c.ordersCount, locale)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tnum">
                        {formatMoney(c.totalSpent, locale)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
