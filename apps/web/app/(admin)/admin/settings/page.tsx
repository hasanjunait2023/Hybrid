import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";

// Settings hub (DESIGN §P6). Mobile = a list of section rows → detail; the three
// concerns (payments / courier / store) each get their own page. Operator-facing,
// calm, one section per concern.
const SECTIONS = [
  { href: "/admin/settings/payments", bn: "পেমেন্ট", sub: "বিকাশ, নগদ, SSLCommerz, COD" },
  { href: "/admin/settings/courier", bn: "কুরিয়ার", sub: "Steadfast, Pathao" },
  { href: "/admin/settings/notifications", bn: "নোটিফিকেশন", sub: "SMS সংযোগ" },
  { href: "/admin/settings/domains", bn: "কাস্টম ডোমেইন", sub: "নিজের ডোমেইন যোগ করুন" },
  { href: "/admin/settings/analytics", bn: "অ্যানালিটিক্স", sub: "GA4, Meta Pixel/CAPI" },
  { href: "/admin/settings/store", bn: "স্টোর প্রোফাইল", sub: "নাম, ফোন, ঠিকানা, পলিসি" },
];

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  return (
    <div lang="en" className="space-y-5">
      <h1 className="text-xl font-bold text-ink">সেটিংস</h1>
      <ul className="space-y-2">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <a
              href={s.href}
              className="flex min-h-[56px] items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 shadow-xs hover:bg-surface-2"
            >
              <span>
                <span className="block font-semibold text-ink">{s.bn}</span>
                <span className="block text-xs text-ink-muted">{s.sub}</span>
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
