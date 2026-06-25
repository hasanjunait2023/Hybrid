import { formatBdtLatin } from "@hybrid/ui";
import { listPlans } from "@/lib/platform/plans";
import { PlanEditor } from "./PlanEditor";

// Plans & limits (PP1-A4). Super-admin manages the plan catalog (price, billing,
// resource limits). Authz via layout.
export const dynamic = "force-dynamic";

const lim = (n: number | null) => (n == null ? "∞" : String(n));

export default async function PlansPage() {
  const plans = await listPlans();

  return (
    <div lang="en" className="space-y-5">
      <div>
        <a href="/platform" className="text-sm font-medium text-ink-muted hover:text-primary">← ড্যাশবোর্ড</a>
        <h1 className="mt-1 text-xl font-bold text-ink">প্ল্যান ও লিমিট</h1>
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2 font-semibold">প্ল্যান</th>
              <th className="px-4 py-2 text-right font-semibold">মূল্য</th>
              <th className="px-4 py-2 text-right font-semibold">পণ্য</th>
              <th className="px-4 py-2 text-right font-semibold">অর্ডার/মাস</th>
              <th className="px-4 py-2 text-right font-semibold">স্টাফ</th>
              <th className="px-4 py-2 text-right font-semibold">ডোমেইন</th>
              <th className="px-4 py-2 font-semibold">স্ট্যাটাস</th>
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
                  {formatBdtLatin(p.priceBdt)}<span className="text-2xs text-ink-subtle">/{p.billingInterval === "yearly" ? "yr" : "mo"}</span>
                </td>
                <td className="px-4 py-2 text-right font-mono text-ink-muted tnum">{lim(p.maxProducts)}</td>
                <td className="px-4 py-2 text-right font-mono text-ink-muted tnum">{lim(p.maxOrdersMonth)}</td>
                <td className="px-4 py-2 text-right font-mono text-ink-muted tnum">{p.maxStaff}</td>
                <td className="px-4 py-2 text-right font-mono text-ink-muted tnum">{p.maxCustomDomains}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${p.isActive ? "bg-success-weak text-success" : "bg-surface-2 text-ink-muted"}`}>
                    {p.isActive ? "সক্রিয়" : "নিষ্ক্রিয়"}
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
