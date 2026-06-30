import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { getTenantBusinessType } from "@/lib/admin/wholesale";
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
  // O13 — TIN/BIN (Bangladesh NBR tax compliance) on every invoice.
  { href: "/admin/settings/tax", key: "tax" },
  { href: "/admin/settings/staff", key: "staff" },
  { href: "/admin/settings/loyalty", key: "loyalty" },
  // R3 — per-category size charts on the PDP.
  { href: "/admin/settings/size-charts", key: "sizeCharts" },
] as const;

export default async function SettingsPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const businessType = await getTenantBusinessType(tenantId);
  const isWholesale = businessType === "wholesale" || businessType === "both";

  const { d } = await getDict();
  const t = d.admin.settingsGeneral;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-ink">{t.title}</h1>

      {/* Store type — set at signup. Switching retail↔wholesale needs platform
          approval (KYC), so it is shown read-only here. */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
        <span>
          <span className="block text-xs text-ink-muted">স্টোরের ধরন</span>
          <span className="block font-semibold text-ink">
            {isWholesale ? "পাইকারি (Wholesale)" : "খুচরা (Retail)"}
          </span>
        </span>
        <span
          className={
            isWholesale
              ? "rounded-full bg-primary-weak px-2.5 py-0.5 text-2xs font-semibold text-primary"
              : "rounded-full bg-success-weak px-2.5 py-0.5 text-2xs font-semibold text-success"
          }
        >
          {isWholesale ? "B2B" : "B2C"}
        </span>
      </div>
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
        {/* Static / policy pages — not yet in the i18n sections map (inline). */}
        <li>
          <a
            href="/admin/settings/pages"
            className="flex min-h-[56px] items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 shadow-xs hover:bg-surface-2"
          >
            <span>
              <span className="block font-semibold text-ink">পেজ</span>
              <span className="block text-xs text-ink-muted">প্রাইভেসি, রিটার্ন, শর্তাবলী ও কাস্টম পেজ</span>
            </span>
            <span aria-hidden className="text-ink-subtle">
              →
            </span>
          </a>
        </li>
      </ul>
    </div>
  );
}
