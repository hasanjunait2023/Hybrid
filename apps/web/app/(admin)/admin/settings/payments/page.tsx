import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import {
  getPaymentSettings,
  getNagadSettings,
  getSslcommerzSettings,
  getHybridpaySettings,
} from "@/lib/admin/settings";
import { getProviderCallbackUrl } from "@/lib/domains/callbackUrl";
import { getDict } from "@/lib/i18n/server";
import { HybridPayForm } from "./HybridPayForm";
import { BkashForm } from "./BkashForm";
import { NagadForm } from "./NagadForm";
import { SslcommerzForm } from "./SslcommerzForm";
import { CodForm } from "./CodForm";
import { Breadcrumbs } from "../../_ui";

// Payment settings (DESIGN §Q4). COD (market default) + bKash + Nagad +
// SSLCommerz, each on the shared <ProviderCard>. Secrets are write-masked.
// Nagad/SSLCommerz callback/IPN URLs are SERVER-DERIVED from the verified domain
// (never client-supplied) and shown as copy-able — the silent-failure guard.
export default async function PaymentSettingsPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");
  const userId = session.userId;

  const [payment, nagad, sslcommerz, hybridpay, bkashCb, nagadCb, sslIpn, hybridpayCb] =
    await Promise.all([
      getPaymentSettings(tenantId, userId),
      getNagadSettings(tenantId, userId),
      getSslcommerzSettings(tenantId, userId),
      getHybridpaySettings(tenantId, userId),
      getProviderCallbackUrl(tenantId, userId, "bkash"),
      getProviderCallbackUrl(tenantId, userId, "nagad"),
      getProviderCallbackUrl(tenantId, userId, "sslcommerz"),
      getProviderCallbackUrl(tenantId, userId, "hybridpay"),
    ]);

  const { d } = await getDict();
  const t = d.admin.settingsPayments;

  return (
    <div className="max-w-xl space-y-5">
      <Breadcrumbs
        items={[
          { label: d.admin.nav.settings, href: "/admin/settings" },
          { label: t.title },
        ]}
      />
      <h1 className="text-xl font-bold text-ink">{t.title}</h1>

      {/* Hybrid Pay = the single online gateway (subsumes bKash/Nagad/etc) + COD. */}
      <HybridPayForm settings={hybridpay} webhookUrl={hybridpayCb} />
      <CodForm enabled={payment.cod.enabled} />

      {/* Legacy direct gateways — kept functional but de-emphasized. Hybrid Pay
          is the recommended path; these remain for tenants already wired to a
          direct merchant account. */}
      <details className="rounded-lg border border-border bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink-muted">
          ডিরেক্ট গেটওয়ে (ঐচ্ছিক / অ্যাডভান্সড)
        </summary>
        <div className="space-y-5 border-t border-border p-4">
          <BkashForm settings={payment.bkash} callbackUrl={bkashCb} />
          <NagadForm settings={nagad} callbackUrl={nagadCb} />
          <SslcommerzForm settings={sslcommerz} ipnUrl={sslIpn} />
        </div>
      </details>
    </div>
  );
}
