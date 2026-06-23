import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getStoreProfile } from "@/lib/admin/settings";
import { StoreProfileForm } from "./StoreProfileForm";

// Store profile settings (DESIGN §P6). Name, hotline, social (Facebook first),
// address, return policy, VAT/BIN. Subdomain shown read-only (mono).
export default async function StoreSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const profile = await getStoreProfile(tenantId, session.userId);

  return (
    <div lang="en" className="max-w-xl space-y-5">
      <a href="/admin/settings" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← সেটিংস
      </a>
      <h1 className="text-xl font-bold text-ink">স্টোর প্রোফাইল</h1>
      <StoreProfileForm profile={profile} />
    </div>
  );
}
