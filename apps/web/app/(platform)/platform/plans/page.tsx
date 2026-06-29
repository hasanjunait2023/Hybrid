import { listPlans } from "@/lib/platform/plans";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import { PlanEditor } from "./PlanEditor";

// Plans & limits (PP1-A4). Super-admin manages the plan catalog (price, billing,
// resource limits). "Homies-Lab" console skin. Authz via layout.
export const dynamic = "force-dynamic";

const lim = (n: number | null, locale: Locale) => (n == null ? "∞" : formatNumber(n, locale));

export default async function PlansPage() {
  const plans = await listPlans();
  const { locale, d } = await getDict();
  const tx = d.platform.plans;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] font-medium text-[var(--pf-muted)]">
        Home <span className="px-1 text-[var(--pf-subtle)]">/</span>
        <span className="text-[var(--pf-ink)]">Plans</span>
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-[var(--pf-ink)]">{tx.title}</h1>
          <p className="mt-1 text-[13px] text-[var(--pf-muted)]">Pricing tiers and resource limits for every store.</p>
        </div>
        <PlanEditor />
      </div>

      <section className="overflow-hidden rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-4 lg:p-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--pf-subtle)]">
                <th className="pb-2.5 font-semibold">{tx.plan}</th>
                <th className="pb-2.5 text-right font-semibold">{tx.price}</th>
                <th className="pb-2.5 text-right font-semibold">{tx.products}</th>
                <th className="pb-2.5 text-right font-semibold">{tx.ordersPerMonth}</th>
                <th className="pb-2.5 text-right font-semibold">{tx.staff}</th>
                <th className="pb-2.5 text-right font-semibold">{tx.domains}</th>
                <th className="pb-2.5 font-semibold">{tx.status}</th>
                <th className="pb-2.5 text-right font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-t border-[var(--pf-border)] align-middle">
                  <td className="py-3">
                    <span className="font-semibold text-[var(--pf-ink)]">{p.name}</span>
                    <span className="ml-1.5 font-mono text-[11px] text-[var(--pf-subtle)]">{p.code}</span>
                  </td>
                  <td className="py-3 text-right font-mono text-[var(--pf-ink)]">
                    {formatMoney(p.priceBdt, locale)}<span className="text-[11px] text-[var(--pf-subtle)]">/{p.billingInterval === "yearly" ? "yr" : "mo"}</span>
                  </td>
                  <td className="py-3 text-right font-mono text-[var(--pf-muted)]">{lim(p.maxProducts, locale)}</td>
                  <td className="py-3 text-right font-mono text-[var(--pf-muted)]">{lim(p.maxOrdersMonth, locale)}</td>
                  <td className="py-3 text-right font-mono text-[var(--pf-muted)]">{formatNumber(p.maxStaff, locale)}</td>
                  <td className="py-3 text-right font-mono text-[var(--pf-muted)]">{formatNumber(p.maxCustomDomains, locale)}</td>
                  <td className="py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.isActive ? "bg-[#e6f6ee] text-[var(--pf-success)]" : "bg-[#f0ede4] text-[var(--pf-muted)]"}`}>
                      {p.isActive ? tx.active : tx.inactive}
                    </span>
                  </td>
                  <td className="py-3 text-right"><PlanEditor plan={p} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
