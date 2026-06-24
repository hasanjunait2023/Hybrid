import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getCourierSettings, getPathaoSettings } from "@/lib/admin/settings";
import { SteadfastForm } from "./SteadfastForm";
import { PathaoForm } from "./PathaoForm";
import { ComingSoonCard } from "./ComingSoonCard";

// Courier settings (DESIGN §Q4). Steadfast + Pathao on the shared <ProviderCard>;
// RedX/Paperfly show honest "coming soon" (no public API docs yet — brief §2.5).
export default async function CourierSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const [steadfast, pathao] = await Promise.all([
    getCourierSettings(tenantId, session.userId),
    getPathaoSettings(tenantId, session.userId),
  ]);

  return (
    <div lang="en" className="max-w-xl space-y-5">
      <a href="/admin/settings" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← সেটিংস
      </a>
      <h1 className="text-xl font-bold text-ink">কুরিয়ার</h1>
      <SteadfastForm settings={steadfast} />
      <PathaoForm settings={pathao} />
      <ComingSoonCard title="RedX" />
      <ComingSoonCard title="Paperfly" />
    </div>
  );
}
