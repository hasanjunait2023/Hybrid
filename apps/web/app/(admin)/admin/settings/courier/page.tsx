import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getCourierSettings } from "@/lib/admin/settings";
import { SteadfastForm } from "./SteadfastForm";

// Courier settings (DESIGN §P6). Steadfast Api-Key / Secret-Key (masked) + an
// HONEST note that live courier needs a real merchant account (no sandbox).
export default async function CourierSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const settings = await getCourierSettings(tenantId, session.userId);

  return (
    <div lang="en" className="max-w-xl space-y-5">
      <a href="/admin/settings" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← সেটিংস
      </a>
      <h1 className="text-xl font-bold text-ink">কুরিয়ার (Steadfast)</h1>
      <SteadfastForm settings={settings} />
    </div>
  );
}
