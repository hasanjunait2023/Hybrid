import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import Link from "next/link";
import { getActiveTenantId } from "@/lib/admin/data";
import { getDict } from "@/lib/i18n/server";
import { PageHeader } from "../_ui";

// Wholesale dashboard hub — links to all sub-pages.
export default async function WholesaleDashboardPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const { d } = await getDict();
  const t = d.admin.wholesale.dashboard;

  const links: { href: string; title: string; desc: string }[] = [
    { href: "/admin/wholesale/products", title: t.products, desc: t.productsDesc },
    { href: "/admin/wholesale/customers", title: t.customers, desc: t.customersDesc },
    { href: "/admin/wholesale/orders", title: t.orders, desc: t.ordersDesc },
    { href: "/admin/wholesale/ledger", title: t.ledger, desc: t.ledgerDesc },
    { href: "/admin/wholesale/settings", title: t.settings, desc: t.settingsDesc },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-lg border border-border bg-surface p-5 shadow-xs transition-shadow hover:shadow-md"
          >
            <h2 className="text-lg font-bold text-ink">{l.title}</h2>
            <p className="mt-1 text-sm text-ink-muted">{l.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
