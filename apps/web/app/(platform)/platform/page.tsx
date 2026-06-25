import { getPlatformStats } from "@/lib/platform/analytics";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

// Platform dashboard (tenant roadmap PP1-A1). Hybrid's own business view across
// every tenant: MRR/ARR, GMV, signups, churn, plan mix. Authz via the layout
// (getPlatformAdmin). Operator-facing → Latin numerals.
export const dynamic = "force-dynamic";

export default async function PlatformDashboard() {
  const s = await getPlatformStats();
  const maxSignup = Math.max(1, ...s.signupSeries.map((d) => d.count));

  const { locale, d } = await getDict();
  const t = d.platform.dashboard;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-ink">{t.title}</h1>
      <nav className="flex flex-wrap gap-2">
        {[
          { href: "/platform/tenants", label: d.platform.nav.tenants },
          { href: "/platform/billing", label: d.platform.nav.billing },
          { href: "/platform/plans", label: d.platform.nav.plans },
          { href: "/platform/finance", label: d.platform.nav.finance },
          { href: "/platform/team", label: d.platform.nav.team },
        ].map((l) => (
          <a key={l.href} href={l.href} className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-semibold text-ink hover:bg-surface-2">
            {l.label}
          </a>
        ))}
      </nav>

      {/* Revenue + scale KPIs */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t.mrr} value={formatMoney(s.mrr, locale)} sub={`${t.arr} ${formatMoney(s.arr, locale)}`} accent />
        <Stat label={t.gmv30d} value={formatMoney(s.gmv30d, locale)} sub={`${formatNumber(s.orders30d, locale)} ${t.ordersUnit}`} />
        <Stat label={t.liveStores} value={formatNumber(s.liveStores, locale)} sub={`${formatNumber(s.tenants.total, locale)} ${t.totalSuffix}`} />
        <Stat label={t.signups30d} value={formatNumber(s.signups30d, locale)} />
      </section>

      {/* Tenant lifecycle breakdown */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Mini label={t.lifecycle.trial} value={s.tenants.trial} tone="warning" locale={locale} />
        <Mini label={t.lifecycle.active} value={s.tenants.active} tone="success" locale={locale} />
        <Mini label={t.lifecycle.pastDue} value={s.tenants.pastDue} tone="warning" locale={locale} />
        <Mini label={t.lifecycle.suspended} value={s.tenants.suspended} tone="danger" locale={locale} />
        <Mini label={t.lifecycle.cancelled} value={s.tenants.cancelled} tone="danger" locale={locale} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {/* Signups chart */}
        <div className="rounded-lg border border-border bg-surface p-4 shadow-xs lg:col-span-2">
          <h2 className="mb-4 text-sm font-bold text-ink">{t.signupsChart}</h2>
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
          <h2 className="mb-3 text-sm font-bold text-ink">{t.mrrByPlan}</h2>
          {s.mrrByPlan.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-muted">{t.noActiveSubscriptions}</p>
          ) : (
            <ul className="space-y-2">
              {s.mrrByPlan.map((p) => (
                <li key={p.plan} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink">{p.plan}<span className="ml-1 text-ink-subtle">· {formatNumber(p.tenants, locale)}</span></span>
                  <span className="font-mono font-semibold text-ink tnum">{formatMoney(p.mrr, locale)}</span>
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

function Mini({ label, value, tone, locale }: { label: string; value: number; tone: "success" | "warning" | "danger"; locale: Locale }) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-danger";
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-center shadow-xs">
      <p className={`font-mono text-xl font-bold tnum ${c}`}>{formatNumber(value, locale)}</p>
      <p className="mt-0.5 text-2xs text-ink-muted">{label}</p>
    </div>
  );
}
