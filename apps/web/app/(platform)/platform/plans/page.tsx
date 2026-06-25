import { listPlans } from "@/lib/platform/plans";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import { PlanEditor } from "./PlanEditor";

// Plans & limits (PP1-A4). Super-admin manages the plan catalog (price, billing,
// resource limits). Authz via layout.
export const dynamic = "force-dynamic";

const lim = (n: number | null, locale: Locale) => (n == null ? "∞" : formatNumber(n, locale));

export default async function PlansPage() {
  const plans = await listPlans();
  const { locale, d } = await getDict();
  const tx = d.platform.plans;

  return (
    <div className="space-y-5">
      <div>
        <a href="/platform" className="text-sm font-medium text-ink-muted hover:text-primary">{d.platform.common.backToDashboard}</a>
        <h1 className="mt-1 text-xl font-bold text-ink">{tx.title}</h1>
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2 font-semibold">{tx.plan}</th>
              <th className="px-4 py-2 text-right font-semibold">{tx.price}</th>
              <th className="px-4 py-2 text-right font-semibold">{tx.products}</th>
              <th className="px-4 py-2 text-right font-semibold">{tx.ordersPerMonth}</th>
              <th className="px-4 py-2 text-right font-semibold">{tx.staff}</th>
              <th className="px-4 py-2 text-right font-semibold">{tx.domains}</th>
              <th className="px-4 py-2 font-semibold">{tx.status}</th>
              <th className="px-4 py-2 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p, i) => (
              <tr key={p.id} className={i % 2 === 1 ? "bg-surface-2" : undefined}>
                <td className="px-4 py-2">
                  <span className="font-medium text-ink">{p.name}</span>
                  <span className="ml-1 font-mono text-2xs text-ink-subtle">{p.code}</span>
                </td>
                <td className="px-4 py-2 text-right font-mono text-ink tnum">
                  {formatMoney(p.priceBdt, locale)}<span className="text-2xs text-ink-subtle">/{p.billingInterval === "yearly" ? "yr" : "mo"}</span>
                </td>
                <td className="px-4 py-2 text-right font-mono text-ink-muted tnum">{lim(p.maxProducts, locale)}</td>
                <td className="px-4 py-2 text-right font-mono text-ink-muted tnum">{lim(p.maxOrdersMonth, locale)}</td>
                <td className="px-4 py-2 text-right font-mono text-ink-muted tnum">{formatNumber(p.maxStaff, locale)}</td>
                <td className="px-4 py-2 text-right font-mono text-ink-muted tnum">{formatNumber(p.maxCustomDomains, locale)}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${p.isActive ? "bg-success-weak text-success" : "bg-surface-2 text-ink-muted"}`}>
                    {p.isActive ? tx.active : tx.inactive}
                  </span>
                </td>
                <td className="px-4 py-2"><PlanEditor plan={p} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <PlanEditor />
    </div>
  );
}
