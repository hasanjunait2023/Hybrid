"use client";

// Admin navigation (DESIGN §P2.1). Mobile = bottom tab bar (one-thumb), desktop
// = fixed left sidebar. Active item highlighted via the current pathname. Tap
// targets ≥ 44px. Indigo only for the active state (calm dialect).
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  ReceiptIcon,
  BoxesIcon,
  UsersIcon,
  MenuIcon,
  TruckIcon,
  ShieldIcon,
} from "@hybrid/ui";
import { cn } from "@hybrid/ui";

interface NavItem {
  href: string;
  bn: string;
  Icon: (props: { className?: string }) => React.ReactNode;
  /** match prefix so nested routes keep the tab active. */
  match: string;
}

const ITEMS: NavItem[] = [
  { href: "/admin", bn: "হোম", Icon: HomeIcon, match: "/admin" },
  { href: "/admin/orders", bn: "অর্ডার", Icon: ReceiptIcon, match: "/admin/orders" },
  { href: "/admin/products", bn: "পণ্য", Icon: BoxesIcon, match: "/admin/products" },
  { href: "/admin/customers", bn: "গ্রাহক", Icon: UsersIcon, match: "/admin/customers" },
  { href: "/admin/collections", bn: "আরও", Icon: MenuIcon, match: "/admin/collections" },
];

// Secondary surfaces (Wave-2). The mobile bottom-tab grid stays five items, so
// these live in the desktop sidebar's "আরও" group and remain reachable there.
const MORE_ITEMS: NavItem[] = [
  { href: "/admin/themes", bn: "থিম ও ডিজাইন", Icon: MenuIcon, match: "/admin/themes" },
  { href: "/admin/cod", bn: "ক্যাশ অন ডেলিভারি", Icon: TruckIcon, match: "/admin/cod" },
  { href: "/admin/settings", bn: "সেটিংস", Icon: ShieldIcon, match: "/admin/settings" },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/admin") return pathname === "/admin";
  return pathname.startsWith(item.match);
}

export function AdminNav({
  variant,
  tenantId,
}: {
  variant: "sidebar" | "tabs";
  tenantId: string;
}) {
  const pathname = usePathname();

  if (variant === "sidebar") {
    return (
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-5">
          <span className="text-lg font-bold text-ink">Hybrid</span>
          <span className="rounded-full bg-primary-weak px-2 py-0.5 text-2xs font-semibold text-primary">
            অ্যাডমিন
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="অ্যাডমিন নেভিগেশন">
          {ITEMS.map((item) => (
            <SidebarLink key={item.href} item={item} active={isActive(pathname, item)} />
          ))}
          <div className="my-2 border-t border-border" />
          {MORE_ITEMS.map((item) => (
            <SidebarLink key={item.href} item={item} active={isActive(pathname, item)} />
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <span className="block truncate font-mono text-2xs text-ink-subtle">
            {tenantId}
          </span>
        </div>
      </aside>
    );
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-sticky grid grid-cols-5 border-t border-border bg-surface lg:hidden"
      aria-label="অ্যাডমিন নেভিগেশন"
    >
      {ITEMS.map((item) => {
        const active = isActive(pathname, item);
        return (
          <a
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-[56px] flex-col items-center justify-center gap-1 py-2 text-2xs font-medium",
              active ? "text-primary" : "text-ink-muted",
            )}
          >
            {active && (
              <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary" />
            )}
            <item.Icon className="h-5 w-5" />
            {item.bn}
          </a>
        );
      })}
    </nav>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <a
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary-weak text-primary"
          : "text-ink-muted hover:bg-surface-2 hover:text-ink",
      )}
    >
      <item.Icon className="h-5 w-5" />
      {item.bn}
    </a>
  );
}
