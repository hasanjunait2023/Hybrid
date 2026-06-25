import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getCourierSettings, getPathaoSettings } from "@/lib/admin/settings";
import { getDict } from "@/lib/i18n/server";
import { SteadfastForm } from "./SteadfastForm";
import { PathaoForm } from "./PathaoForm";
import { ComingSoonCard } from "./ComingSoonCard";

// Courier settings (DESIGN §Q4). Steadfast + Pathao on the shared <ProviderCard>;
// RedX/Paperfly show honest "coming soon" (no public API docs yet — brief §2.5).
export default async function CourierSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const [steadfast, pathao] = await Promise.all([
    getCourierSettings(tenantId, session.userId),
    getPathaoSettings(tenantId, session.userId),
  ]);

  const { d } = await getDict();
  const t = d.admin.settingsComms;

  return (
    <div className="max-w-xl space-y-5">
      <a href="/admin/settings" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← {t.settingsLink}
      </a>
      <h1 className="text-xl font-bold text-ink">{t.courier.title}</h1>
      <SteadfastForm settings={steadfast} />
      <PathaoForm settings={pathao} />
      <ComingSoonCard title="RedX" />
      <ComingSoonCard title="Paperfly" />
    </div>
  );
}
