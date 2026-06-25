import { formatBdtLatin } from "@hybrid/ui";
import { getPlatformStats } from "@/lib/platform/analytics";

// Platform dashboard (tenant roadmap PP1-A1). Hybrid's own business view across
// every tenant: MRR/ARR, GMV, signups, churn, plan mix. Authz via the layout
// (getPlatformAdmin). Operator-facing → Latin numerals.
export const dynamic = "force-dynamic";

export default async function PlatformDashboard() {
  const s = await getPlatformStats();
  const maxSignup = Math.max(1, ...s.signupSeries.map((d) => d.count));

  return (
    <div lang="en" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">প্ল্যাটফর্ম ড্যাশবোর্ড</h1>
        <a href="/platform/tenants" className="rounded-md border border-border-strong px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-2">
          টেন্যান্ট ডিরেক্টরি →
        </a>
      </div>

      {/* Revenue + scale KPIs */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="MRR" value={formatBdtLatin(s.mrr)} sub={`ARR ${formatBdtLatin(s.arr)}`} accent />
        <Stat label="GMV (৩০ দিন)" value={formatBdtLatin(s.gmv30d)} sub={`${s.orders30d} অর্ডার`} />
        <Stat label="লাইভ স্টোর" value={String(s.liveStores)} sub={`${s.tenants.total} মোট`} />
        <Stat label="নতুন সাইনআপ (৩০দিন)" value={String(s.signups30d)} />
      </section>

      {/* Tenant lifecycle breakdown */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Mini label="ট্রায়াল" value={s.tenants.trial} tone="warning" />
        <Mini label="অ্যাকটিভ" value={s.tenants.active} tone="success" />
        <Mini label="বকেয়া" value={s.tenants.pastDue} tone="warning" />
        <Mini label="সাসপেন্ডেড" value={s.tenants.suspended} tone="danger" />
        <Mini label="বাতিল" value={s.tenants.cancelled} tone="danger" />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {/* Signups chart */}
        <div className="rounded-lg border border-border bg-surface p-4 shadow-xs lg:col-span-2">
          <h2 className="mb-4 text-sm font-bold text-ink">সাইনআপ (গত ১৪ দিন)</h2>
          <div className="flex h-36 items-end gap-1.5">
            {s.signupSeries.map((d) => {
              const pct = d.count > 0 ? Math.max(8, (d.count / maxSignup) * 100) : 2;
              return (
                <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={`w-full rounded-t-sm ${d.count > 0 ? "bg-primary" : "bg-primary-weak"}`}
                      style={{ height: `${pct}%` }}
                      title={`${d.day}: ${d.count}`}
                    />
                  </div>
                  <span className="text-2xs leading-none text-ink-subtle tnum">
                    {new Date(d.day + "T00:00:00+06:00").getUTCDate()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* MRR by plan */}
        <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
          <h2 className="mb-3 text-sm font-bold text-ink">প্ল্যান অনুযায়ী MRR</h2>
          {s.mrrByPlan.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-muted">কোনো সক্রিয় সাবস্ক্রিপশন নেই।</p>
          ) : (
            <ul className="space-y-2">
              {s.mrrByPlan.map((p) => (
                <li key={p.plan} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink">{p.plan}<span className="ml-1 text-ink-subtle">· {p.tenants}</span></span>
                  <span className="font-mono font-semibold text-ink tnum">{formatBdtLatin(p.mrr)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub, accent = false }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 shadow-xs ${accent ? "border-primary bg-primary-weak" : "border-border bg-surface"}`}>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold leading-none tnum ${accent ? "text-primary" : "text-ink"}`}>{value}</p>
      {sub && <p className="mt-1.5 text-2xs text-ink-subtle">{sub}</p>}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone: "success" | "warning" | "danger" }) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-danger";
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-center shadow-xs">
      <p className={`font-mono text-xl font-bold tnum ${c}`}>{value}</p>
      <p className="mt-0.5 text-2xs text-ink-muted">{label}</p>
    </div>
  );
}
