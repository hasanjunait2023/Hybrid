import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getSmsSettings } from "@/lib/admin/settings";
import { SmsForm } from "./SmsForm";

// Notification settings (DESIGN §Q4). Tenant SMS (own sms.net.bd key) on the
// shared <ProviderCard>. WhatsApp is owned by a later slice (S-WHATSAPP).
export default async function NotificationSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const sms = await getSmsSettings(tenantId, session.userId);

  return (
    <div lang="en" className="max-w-xl space-y-5">
      <a href="/admin/settings" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← সেটিংস
      </a>
      <h1 className="text-xl font-bold text-ink">নোটিফিকেশন</h1>
      <SmsForm settings={sms} />
    </div>
  );
}
