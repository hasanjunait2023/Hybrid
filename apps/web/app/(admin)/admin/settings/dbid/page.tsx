import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { getDbidSubmission } from "@/lib/admin/dbid";
import { getDict } from "@/lib/i18n/server";
import { DbidForm } from "./DbidForm";

// DBID Compliance Wizard page (Tier 3 P1 — regulatory moat).
// Renders the 4-step wizard inside the standard settings chrome. The wizard
// is fully client-driven after the initial server render — the form manages
// its own step state and calls Server Actions on each save.
export default async function DbidSettingsPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const submission = await getDbidSubmission(tenantId, session.userId);
  const { d } = await getDict();
  const t = d.admin.settingsDbid;

  return (
    <div className="max-w-2xl space-y-5">
      <a
        href="/admin/settings"
        className="text-sm font-medium text-ink-muted hover:text-primary"
      >
        ← {t.settingsLink}
      </a>
      <div>
        <h1 className="text-xl font-bold text-ink">{t.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t.intro}</p>
      </div>
      <DbidForm submission={submission} />
    </div>
  );
}