import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import {
  getPaymentSettings,
  getNagadSettings,
  getSslcommerzSettings,
} from "@/lib/admin/settings";
import { getProviderCallbackUrl } from "@/lib/domains/callbackUrl";
import { getDict } from "@/lib/i18n/server";
import { BkashForm } from "./BkashForm";
import { NagadForm } from "./NagadForm";
import { SslcommerzForm } from "./SslcommerzForm";
import { CodForm } from "./CodForm";

// Payment settings (DESIGN §Q4). COD (market default) + bKash + Nagad +
// SSLCommerz, each on the shared <ProviderCard>. Secrets are write-masked.
// Nagad/SSLCommerz callback/IPN URLs are SERVER-DERIVED from the verified domain
// (never client-supplied) and shown as copy-able — the silent-failure guard.
export default async function PaymentSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");
  const userId = session.userId;

  const [payment, nagad, sslcommerz, bkashCb, nagadCb, sslIpn] = await Promise.all([
    getPaymentSettings(tenantId, userId),
    getNagadSettings(tenantId, userId),
    getSslcommerzSettings(tenantId, userId),
    getProviderCallbackUrl(tenantId, userId, "bkash"),
    getProviderCallbackUrl(tenantId, userId, "nagad"),
    getProviderCallbackUrl(tenantId, userId, "sslcommerz"),
  ]);

  const { d } = await getDict();
  const t = d.admin.settingsPayments;

  return (
    <div className="max-w-xl space-y-5">
      <a href="/admin/settings" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← {t.backToSettings}
      </a>
      <h1 className="text-xl font-bold text-ink">{t.title}</h1>

      <CodForm enabled={payment.cod.enabled} />
      <BkashForm settings={payment.bkash} callbackUrl={bkashCb} />
      <NagadForm settings={nagad} callbackUrl={nagadCb} />
      <SslcommerzForm settings={sslcommerz} ipnUrl={sslIpn} />
    </div>
  );
}
