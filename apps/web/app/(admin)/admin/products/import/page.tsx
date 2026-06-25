import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getDict } from "@/lib/i18n/server";
import { PageHeader } from "../../_ui";
import { ImportForm } from "./ImportForm";

// Product CSV import (P2-5). Bulk onboarding for sellers who keep their catalog
// in Excel. Columns: title (required), price, inventory, status, sku.
export const dynamic = "force-dynamic";

export default async function ProductImportPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const { d } = await getDict();
  const t = d.admin.products.import;

  return (
    <div className="space-y-4">
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <div className="rounded-lg border border-border bg-surface p-4 text-sm text-ink-muted">
        <p className="font-semibold text-ink">{t.columnsLabel}</p>
        <p className="mt-1 font-mono text-xs">title, price, inventory, status, sku</p>
        <p className="mt-2">
          <span className="font-semibold">title</span> {t.columnsHelp}
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
