import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getSmsSettings, getWhatsAppSettings } from "@/lib/admin/settings";
import { getDict } from "@/lib/i18n/server";
import { SmsForm } from "./SmsForm";
import { WhatsAppForm } from "./WhatsAppForm";

// Notification settings (DESIGN §Q4). Tenant SMS (own sms.net.bd key) +
// WhatsApp Cloud API (own WABA creds), each on the shared <ProviderCard>.
// WhatsApp is ADDITIVE to SMS and per-tenant opt-in.
export default async function NotificationSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const [sms, whatsapp] = await Promise.all([
    getSmsSettings(tenantId, session.userId),
    getWhatsAppSettings(tenantId, session.userId),
  ]);

  const { d } = await getDict();
  const t = d.admin.settingsComms;

  return (
    <div className="max-w-xl space-y-5">
      <a href="/admin/settings" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← {t.settingsLink}
      </a>
      <h1 className="text-xl font-bold text-ink">{t.notifications.title}</h1>
      <SmsForm settings={sms} />
      <WhatsAppForm settings={whatsapp} />
    </div>
  );
}
