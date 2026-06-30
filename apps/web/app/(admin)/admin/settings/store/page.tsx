import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { getStoreProfile } from "@/lib/admin/settings";
import { getDict } from "@/lib/i18n/server";
import { StoreProfileForm } from "./StoreProfileForm";

// Store profile settings (DESIGN §P6). Name, hotline, social (Facebook first),
// address, return policy, VAT/BIN. Subdomain shown read-only (mono).
export default async function StoreSettingsPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const profile = await getStoreProfile(tenantId, session.userId);

  const { d } = await getDict();
  const t = d.admin.settingsGeneral;

  return (
    <div className="max-w-xl space-y-5">
      <a href="/admin/settings" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← {t.title}
      </a>
      <h1 className="text-xl font-bold text-ink">{t.store.title}</h1>
      <StoreProfileForm profile={profile} />
    </div>
  );
}
