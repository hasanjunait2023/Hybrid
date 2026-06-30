// =============================================================================
// R3 — Per-category size chart editor (admin).
//
// Lists the tenant's existing charts and lets the merchant pick a category
// (from the documented taxonomy) and edit the unit + columns + rows. Saves
// through the `upsertSizeChart` Server Action in `./actions.ts`. The chart
// is published immediately — the next PDP render reads it from the cache.
//
// Layout matches the other settings pages: back-link + title + the form
// panel. Mobile-first bottom-sheet editor would be nicer but a stacked form
// is the consistent pattern across settings pages.
// =============================================================================

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { getDict } from "@/lib/i18n/server";
import { listSizeCharts } from "@/lib/products/sizeChart";
import { SizeChartsEditor } from "./SizeChartsEditor";

export const dynamic = "force-dynamic";

export default async function SizeChartsSettingsPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const [charts, dict] = await Promise.all([
    listSizeCharts(tenantId, session.userId),
    getDict(),
  ]);

  const t = dict.d.admin.settingsComms.sizeCharts;

  return (
    <div className="max-w-3xl space-y-5">
      <a
        href="/admin/settings"
        className="text-sm font-medium text-ink-muted hover:text-primary"
      >
        ← {dict.d.admin.settingsComms.settingsLink}
      </a>
      <div>
        <h1 className="text-xl font-bold text-ink">{t.title}</h1>
        <p className="text-sm text-ink-muted">{t.subtitle}</p>
      </div>
      <SizeChartsEditor
        tenantId={tenantId}
        existing={charts}
        labels={t}
        locale={dict.locale}
      />
    </div>
  );
}
