import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { getProgram } from "@/lib/admin/loyalty";
import { getDict } from "@/lib/i18n/server";
import { PageHeader } from "../../_ui";
import { LoyaltyForm } from "./LoyaltyForm";

// Loyalty program settings (tenant roadmap P3-2). Enable + set earn/redeem
// rates. Earn fires on delivered orders; redemption converts points to a taka
// discount at checkout (wiring follows).
export const dynamic = "force-dynamic";

export default async function LoyaltySettingsPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const program = await getProgram(tenantId, session.userId);

  const { d } = await getDict();
  const t = d.admin.settingsGeneral.loyalty;

  return (
    <div className="space-y-4">
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <LoyaltyForm program={program} />
    </div>
  );
}
