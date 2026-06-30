import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { listBlocklist } from "@/lib/admin/fraud";
import { getDict } from "@/lib/i18n/server";
import { formatNumber } from "@/lib/i18n/format";
import { PageHeader } from "../../_ui";
import { BlocklistManager } from "./BlocklistManager";

// Phone blocklist (tenant roadmap P1 #2). Sellers maintain a list of blocked
// numbers (repeat non-responders / fake COD orders). Blocked numbers surface as
// a risk signal on the order-detail panel. Admin = Latin numerals.
export const dynamic = "force-dynamic";

export default async function BlacklistPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const rows = await listBlocklist(tenantId, session.userId);

  const { locale, d } = await getDict();
  const t = d.admin.customers.blocklist;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.title}
        subtitle={`${formatNumber(rows.length, locale)} ${t.numbersBlockedSuffix}`}
      />
      <p className="text-sm text-ink-muted">
        {t.description}
      </p>
      <BlocklistManager rows={rows} />
    </div>
  );
}
