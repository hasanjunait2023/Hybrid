import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getShippingSettings } from "@/lib/admin/shipping";
import { getDict } from "@/lib/i18n/server";
import { PageHeader } from "../../_ui";
import { ShippingForm } from "./ShippingForm";

// Shipping & delivery settings. Origin location + per-zone weight-based rates
// the storefront calculator consumes at checkout.
export const dynamic = "force-dynamic";

export default async function ShippingSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const settings = await getShippingSettings(tenantId, session.userId);

  const { d } = await getDict();
  const t = d.admin.shipping;

  return (
    <div className="space-y-4">
      <Link
        href="/admin/settings"
        className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink"
      >
        ‹ {d.admin.nav.settings}
      </Link>
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <ShippingForm initial={settings} />
    </div>
  );
}
