import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getAnalyticsSettings } from "@/lib/admin/settings";
import { getDict } from "@/lib/i18n/server";
import { AnalyticsForm } from "./AnalyticsForm";

// Analytics settings (DESIGN §Q4; blueprint 2.7). GA4 + Meta Pixel/CAPI on the
// shared <ProviderCard>. Public IDs shown in full; secrets write-masked.
export default async function AnalyticsSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const analytics = await getAnalyticsSettings(tenantId, session.userId);

  const { d } = await getDict();
  const t = d.admin.settingsComms;

  return (
    <div className="max-w-xl space-y-5">
      <a href="/admin/settings" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← {t.settingsLink}
      </a>
      <h1 className="text-xl font-bold text-ink">{t.analytics.title}</h1>
      <AnalyticsForm settings={analytics} />
    </div>
  );
}
