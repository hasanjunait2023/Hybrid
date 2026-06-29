import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listJourneys } from "@/lib/admin/journeys";
import { getDict } from "@/lib/i18n/server";
import { formatNumber } from "@/lib/i18n/format";
import { CreateJourneyForm, JourneyRowActions, RunNowButton } from "./JourneyControls";

// CRM lifecycle automations (Phase R1.4). Segment/event-triggered messages:
// review request, win-back, repeat-buyer thank-you. Runs on a cron; "Run now"
// triggers an immediate (idempotent) pass. Sends gated by SMS_LIVE.
export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const journeys = await listJourneys(tenantId, session.userId);
  const { locale, d } = await getDict();
  const t = d.admin.journeys;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{t.title}</h1>
          <p className="text-sm text-ink-muted">{t.subtitle}</p>
        </div>
        <RunNowButton t={t} />
      </div>

      <CreateJourneyForm t={t} />

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {journeys.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-ink-muted">{t.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {journeys.map((j) => (
              <li key={j.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-ink">{j.name}</span>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-ink-muted">
                      {t.triggerShort[j.trigger]}
                    </span>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-medium text-ink-muted">
                      {t.channelSms}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${j.isActive ? "bg-success-weak text-success" : "bg-surface-2 text-ink-muted"}`}
                    >
                      {j.isActive ? t.active : t.paused}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-muted">{j.message}</p>
                  <p className="mt-0.5 text-2xs text-ink-subtle">
                    {formatNumber(j.runCount, locale)} {t.runsUnit}
                  </p>
                </div>
                <JourneyRowActions id={j.id} active={j.isActive} t={t} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
