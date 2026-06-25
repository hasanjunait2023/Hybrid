import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listCampaigns, resolveAudience } from "@/lib/admin/marketing";
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

  const [campaigns, all, repeat] = await Promise.all([
    listCampaigns(tenantId, session.userId),
    resolveAudience(tenantId, session.userId, "all"),
    resolveAudience(tenantId, session.userId, "repeat"),
  ]);

  return (
    <div lang="en" className="space-y-4">
      <PageHeader title="মার্কেটিং" subtitle="SMS ব্রডকাস্ট" />
      <CampaignComposer allCount={all.count} repeatCount={repeat.count} />

      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 text-sm font-bold text-ink">ক্যাম্পেইন ইতিহাস</h2>
        {campaigns.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">এখনো কোনো ক্যাম্পেইন নেই।</p>
        ) : (
          <ul className="divide-y divide-border">
            {campaigns.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">
                    {c.channel} · {c.audience === "all" ? "সব গ্রাহক" : "রিপিট গ্রাহক"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${
                      c.status === "sent" ? "bg-success-weak text-success" : "bg-st-pending-weak text-st-pending"
                    }`}
                  >
                    {c.status === "sent" ? `পাঠানো · ${c.sentCount}/${c.recipientCount}` : "খসড়া"}
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
