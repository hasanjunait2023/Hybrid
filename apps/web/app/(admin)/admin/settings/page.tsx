import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getDict } from "@/lib/i18n/server";

// Settings hub (DESIGN §P6). Mobile = a list of section rows → detail; the three
// concerns (payments / courier / store) each get their own page. Operator-facing,
// calm, one section per concern.
const SECTION_KEYS = [
  { href: "/admin/settings/payments", key: "payments" },
  { href: "/admin/settings/courier", key: "courier" },
  { href: "/admin/settings/notifications", key: "notifications" },
  { href: "/admin/settings/dbid", key: "dbid" },
  { href: "/admin/settings/domains", key: "domains" },
  { href: "/admin/settings/analytics", key: "analytics" },
  { href: "/admin/settings/store", key: "store" },
  { href: "/admin/settings/staff", key: "staff" },
  { href: "/admin/settings/loyalty", key: "loyalty" },
] as const;

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const { d } = await getDict();
  const t = d.admin.settingsGeneral;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-ink">{t.title}</h1>
      <ul className="space-y-2">
        {SECTION_KEYS.map((s) => (
          <li key={s.href}>
            <a
              href={s.href}
              className="flex min-h-[56px] items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 shadow-xs hover:bg-surface-2"
            >
              <span>
                <span className="block font-semibold text-ink">{t.sections[s.key].label}</span>
                <span className="block text-xs text-ink-muted">{t.sections[s.key].sub}</span>
              </span>
              <span aria-hidden className="text-ink-subtle">
                →
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
