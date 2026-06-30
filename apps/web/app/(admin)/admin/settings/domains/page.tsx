import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { getDomainsView } from "@/lib/domains/data";
import { getDict } from "@/lib/i18n/server";
import { DomainsManager } from "./DomainsManager";

// Custom domain connect (DESIGN §Q5). Add domain → DNS records → status states →
// set primary. Backed by tenant_domain; live Vercel calls behind
// VERCEL_DOMAINS_ENABLED (flag off → honest "pending live Vercel").
export default async function DomainsSettingsPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const view = await getDomainsView(tenantId, session.userId);

  const { d } = await getDict();
  const t = d.admin.settingsGeneral;

  return (
    <div className="max-w-xl space-y-5">
      <a href="/admin/settings" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← {t.title}
      </a>
      <h1 className="text-xl font-bold text-ink">{t.domains.title}</h1>
      <DomainsManager view={view} />
    </div>
  );
}
