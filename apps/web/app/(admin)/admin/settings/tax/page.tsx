import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { getTenantTaxIds } from "@/lib/settings/tenantTax";
import { getDict } from "@/lib/i18n/server";
import { TaxForm } from "./TaxForm";

// O13 — Tax / Business settings page. Owner edits TIN + BIN here; both are
// then rendered on the customer-facing invoice (print page) and shown in the
// admin order detail invoice preview.
export default async function TaxSettingsPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const ids = await getTenantTaxIds(tenantId, session.userId);
  const { d } = await getDict();
  const t = d.admin.settingsGeneral.tax;

  return (
    <div className="max-w-xl space-y-5">
      <a href="/admin/settings" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← {d.admin.settingsGeneral.title}
      </a>
      <h1 className="text-xl font-bold text-ink">{t.title}</h1>
      <p className="text-sm text-ink-muted">{t.subtitle}</p>
      <TaxForm initialTin={ids.tin} initialBin={ids.bin} />
    </div>
  );
}