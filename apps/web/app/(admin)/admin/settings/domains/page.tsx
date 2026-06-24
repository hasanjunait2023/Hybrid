import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getDomainsView } from "@/lib/domains/data";
import { DomainsManager } from "./DomainsManager";

// Custom domain connect (DESIGN §Q5). Add domain → DNS records → status states →
// set primary. Backed by tenant_domain; live Vercel calls behind
// VERCEL_DOMAINS_ENABLED (flag off → honest "pending live Vercel").
export default async function DomainsSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const view = await getDomainsView(tenantId, session.userId);

  return (
    <div lang="en" className="max-w-xl space-y-5">
      <a href="/admin/settings" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← সেটিংস
      </a>
      <h1 className="text-xl font-bold text-ink">কাস্টম ডোমেইন</h1>
      <DomainsManager view={view} />
    </div>
  );
}
