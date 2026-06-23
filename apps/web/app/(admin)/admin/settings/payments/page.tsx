import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getPaymentSettings } from "@/lib/admin/settings";
import { BkashForm } from "./BkashForm";
import { CodForm } from "./CodForm";

// Payment settings (DESIGN §P6). COD (market default) + bKash Tokenized Checkout.
// Secrets are write-masked — the page renders only "configured" + a masked tail,
// never the raw key.
export default async function PaymentSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const settings = await getPaymentSettings(tenantId, session.userId);

  return (
    <div lang="en" className="max-w-xl space-y-5">
      <a href="/admin/settings" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← সেটিংস
      </a>
      <h1 className="text-xl font-bold text-ink">পেমেন্ট</h1>

      <CodForm enabled={settings.cod.enabled} />
      <BkashForm settings={settings.bkash} />
    </div>
  );
}
