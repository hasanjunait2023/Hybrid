import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getBusinessHealth, type HealthGrade } from "@/lib/admin/healthScore";
import { getDict } from "@/lib/i18n/server";
import { formatNumber } from "@/lib/i18n/format";
import { AskCoach } from "./AskCoach";

// AI Growth Coach (Phase R2.3). A deterministic Business Health Score + factor
// breakdown + action-linked recommendations, plus an env-gated Bangla AI ask box.
export const dynamic = "force-dynamic";

const GRADE_TONE: Record<HealthGrade, { ring: string; text: string }> = {
  A: { ring: "border-success", text: "text-success" },
  B: { ring: "border-primary", text: "text-primary" },
  C: { ring: "border-warning", text: "text-warning" },
  D: { ring: "border-danger", text: "text-danger" },
};

const SEV_TONE: Record<string, string> = {
  high: "bg-danger-weak text-danger",
  medium: "bg-warning-weak text-warning",
  info: "bg-info-weak text-info",
};

export default async function CoachPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const health = await getBusinessHealth(tenantId, session.userId);
  const { locale, d } = await getDict();
  const t = d.admin.coach;
  const tone = GRADE_TONE[health.grade];

  const recText = (key: string, value?: number) => {
    const tpl = t.rec[key as keyof typeof t.rec] ?? key;
    return value !== undefined ? tpl.replace("{n}", formatNumber(value, locale)) : tpl;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">{t.title}</h1>
        <p className="text-sm text-ink-muted">{t.subtitle}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        {/* Score gauge */}
        <section className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface p-6 shadow-xs">
          <div className={`flex h-32 w-32 flex-col items-center justify-center rounded-full border-8 ${tone.ring}`}>
            <span className={`font-mono text-4xl font-bold leading-none tnum ${tone.text}`}>
              {formatNumber(health.score, locale)}
            </span>
            <span className="mt-1 text-2xs text-ink-muted">/ {formatNumber(100, locale)}</span>
          </div>
          <p className="mt-3 text-sm font-semibold text-ink">{t.scoreLabel}</p>
          <p className={`text-xs font-bold ${tone.text}`}>{t.grade[health.grade]}</p>
        </section>

        {/* Factor breakdown */}
        <section className="rounded-lg border border-border bg-surface p-4 shadow-xs">
          <h2 className="text-sm font-bold text-ink">{t.factorsHeading}</h2>
          <ul className="mt-3 space-y-2.5">
            {health.factors.map((f) => (
              <li key={f.key} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-xs text-ink-muted">
                  {t.factor[f.key as keyof typeof t.factor] ?? f.key}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className={`block h-full rounded-full ${f.score >= 65 ? "bg-success" : f.score >= 50 ? "bg-warning" : "bg-danger"}`}
                    style={{ width: `${f.score}%` }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right font-mono text-xs font-semibold text-ink tnum">
                  {formatNumber(f.score, locale)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Recommendations */}
      <section className="rounded-lg border border-border bg-surface p-4 shadow-xs">
        <h2 className="text-sm font-bold text-ink">{t.recsHeading}</h2>
        {health.recommendations.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">{t.recsEmpty}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {health.recommendations.map((r) => (
              <li
                key={r.key}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${SEV_TONE[r.severity]}`}>
                    {r.severity === "high" ? "!" : r.severity === "medium" ? "•" : "i"}
                  </span>
                  <span className="text-sm text-ink">{recText(r.key, r.value)}</span>
                </div>
                <Link href={r.ctaHref} className="shrink-0 text-2xs font-semibold text-primary hover:underline">
                  {t.cta}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AskCoach t={t} />
    </div>
  );
}
