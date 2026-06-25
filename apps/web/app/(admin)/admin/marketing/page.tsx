import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listCampaigns, resolveAudience } from "@/lib/admin/marketing";
import { getDict } from "@/lib/i18n/server";
import { formatNumber } from "@/lib/i18n/format";
import { PageHeader } from "../_ui";
import { CampaignComposer } from "./CampaignComposer";

// Marketing broadcast (tenant roadmap P2-4). Compose an SMS blast to all or
// repeat customers; history of past sends. Live delivery is gated by SMS_LIVE.
export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const { locale, d } = await getDict();

  const [campaigns, all, repeat] = await Promise.all([
    listCampaigns(tenantId, session.userId),
    resolveAudience(tenantId, session.userId, "all"),
    resolveAudience(tenantId, session.userId, "repeat"),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title={d.admin.marketing.title} subtitle={d.admin.marketing.subtitle} />
      <CampaignComposer allCount={all.count} repeatCount={repeat.count} />

      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 text-sm font-bold text-ink">{d.admin.marketing.history.heading}</h2>
        {campaigns.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">{d.admin.marketing.history.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {campaigns.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">
                    {c.channel} · {c.audience === "all" ? d.admin.marketing.history.audienceAll : d.admin.marketing.history.audienceRepeat}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${
                      c.status === "sent" ? "bg-success-weak text-success" : "bg-st-pending-weak text-st-pending"
                    }`}
                  >
                    {c.status === "sent"
                      ? `${d.admin.marketing.history.sentPrefix} · ${formatNumber(c.sentCount, locale)}/${formatNumber(c.recipientCount, locale)}`
                      : d.admin.marketing.history.draft}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-ink">{c.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
