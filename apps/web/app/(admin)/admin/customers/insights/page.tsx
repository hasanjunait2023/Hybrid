import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import {
  getRfmDistribution,
  getChurnRisk,
  getRetentionCohorts,
} from "@/lib/admin/crmAnalytics";
import type { RfmSegment } from "@/lib/admin/customers";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";

// CRM insights (Phase R1.5). RFM segment distribution, at-risk (churn) shortlist,
// and monthly retention cohorts — the store-wide read of the same RFM model that
// powers the Customer 360 badge.
export const dynamic = "force-dynamic";

const SEG_TONE: Record<RfmSegment, string> = {
  champion: "bg-success-weak text-success",
  loyal: "bg-success-weak text-success",
  active: "bg-primary-weak text-primary",
  at_risk: "bg-warning-weak text-warning",
  lost: "bg-danger-weak text-danger",
  new: "bg-info-weak text-info",
};

export default async function CustomerInsightsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const [rfm, churn, cohorts] = await Promise.all([
    getRfmDistribution(tenantId, session.userId),
    getChurnRisk(tenantId, session.userId),
    getRetentionCohorts(tenantId, session.userId),
  ]);
  const { locale, d } = await getDict();
  const t = d.admin.customers;
  const ti = t.insights;
  const segLabel = t.detail.rfm;
  const maxCohort = Math.max(1, ...cohorts.map((c) => c.customers));

  return (
    <div className="space-y-5">
      <Link href="/admin/customers" className="text-sm font-medium text-ink-muted hover:text-primary">
        {t.detail.backToList}
      </Link>
      <div>
        <h1 className="text-xl font-bold text-ink">{ti.title}</h1>
        <p className="text-sm text-ink-muted">{ti.subtitle}</p>
      </div>

      {/* RFM distribution */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">{ti.rfmHeading}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {rfm.map((r) => (
            <div key={r.segment} className="rounded-lg border border-border bg-surface p-3.5">
              <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-semibold ${SEG_TONE[r.segment]}`}>
                {segLabel[r.segment]}
              </span>
              <p className="mt-2 text-[22px] font-bold leading-none text-ink tnum">{formatNumber(r.count, locale)}</p>
              <p className="mt-1 font-mono text-2xs text-ink-muted tnum">{formatMoney(r.value, locale)}</p>
              <p className="mt-1 text-2xs text-ink-subtle">{ti.segDesc[r.segment]}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Churn risk */}
      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-bold text-ink">{ti.churnHeading}</h2>
          <p className="text-xs text-ink-muted">{ti.churnSubtitle}</p>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {churn.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-muted">{ti.churnEmpty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="px-3 py-2 font-semibold">{t.table.name}</th>
                    <th className="px-3 py-2 font-semibold">{t.table.phone}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t.table.totalSpent}</th>
                    <th className="px-3 py-2 text-right font-semibold">{ti.lastOrder}</th>
                  </tr>
                </thead>
                <tbody>
                  {churn.map((c) => (
                    <tr key={c.id} className="border-b border-border">
                      <td className="px-3 py-2">
                        <Link href={`/admin/customers/${c.id}`} className="font-medium text-ink hover:text-primary hover:underline">
                          {c.name ?? "—"}
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-ink-muted tnum">{c.phone ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono tnum">{formatMoney(c.totalSpent, locale)}</td>
                      <td className="px-3 py-2 text-right text-xs text-ink-muted tnum">
                        {formatNumber(c.recencyDays, locale)} {ti.daysAgo}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Retention cohorts */}
      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-bold text-ink">{ti.cohortHeading}</h2>
          <p className="text-xs text-ink-muted">{ti.cohortSubtitle}</p>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {cohorts.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-muted">{ti.cohortEmpty}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-3 py-2 font-semibold">{ti.cohortMonth}</th>
                  <th className="px-3 py-2 text-right font-semibold">{ti.cohortNew}</th>
                  <th className="px-3 py-2 text-right font-semibold">{ti.cohortRepeat}</th>
                  <th className="px-3 py-2 text-right font-semibold">{ti.cohortRate}</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => (
                  <tr key={c.cohort} className="border-b border-border">
                    <td className="px-3 py-2 font-medium text-ink">
                      {new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { month: "short", year: "numeric", timeZone: "Asia/Dhaka" }).format(new Date(c.cohort + "T00:00:00+06:00"))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tnum">
                      <span className="inline-flex items-center justify-end gap-2">
                        <span className="hidden h-1.5 rounded-full bg-primary sm:inline-block" style={{ width: `${Math.max(6, (c.customers / maxCohort) * 60)}px` }} />
                        {formatNumber(c.customers, locale)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tnum">{formatNumber(c.repeated, locale)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold tnum">{formatNumber(c.repeatRate, locale)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
