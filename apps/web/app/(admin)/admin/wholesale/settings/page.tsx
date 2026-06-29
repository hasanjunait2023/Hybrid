import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getWholesaleSettings } from "@/lib/admin/wholesale";
import { getDict } from "@/lib/i18n/server";
import { PageHeader } from "../_ui";
import { WholesaleSettingsForm } from "./WholesaleSettingsForm";

// Wholesale settings page — tax, payment terms, delivery defaults.
export default async function WholesaleSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const settings = await getWholesaleSettings(tenantId, session.userId);

  const { d } = await getDict();
  const t = d.admin.wholesale.settings;

  return (
    <div className="space-y-4">
      <PageHeader title={t.title} />
      <WholesaleSettingsForm initial={settings} />
    </div>
  );
}
