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
  UndoIcon,
  ChatIcon,
  CheckCircleIcon,
} from "@hybrid/ui";
import { cn, HybridLogo } from "@hybrid/ui";
import { useDict } from "@/lib/i18n/provider";
import type { Messages } from "@/lib/i18n/dictionaries";

type NavKey = keyof Messages["admin"]["nav"];

interface NavItem {
  href: string;
  tKey: NavKey;
  Icon: (props: { className?: string }) => React.ReactNode;
  /** match prefix so nested routes keep the tab active. */
  match: string;
}

const ITEMS: NavItem[] = [
  { href: "/admin", tKey: "home", Icon: HomeIcon, match: "/admin" },
  { href: "/admin/orders", tKey: "orders", Icon: ReceiptIcon, match: "/admin/orders" },
  { href: "/admin/products", tKey: "products", Icon: BoxesIcon, match: "/admin/products" },
  { href: "/admin/customers", tKey: "customers", Icon: UsersIcon, match: "/admin/customers" },
  { href: "/admin/collections", tKey: "more", Icon: MenuIcon, match: "/admin/collections" },
];

// Wholesale nav items — shown only when business_type is 'wholesale' or 'both'.
const WHOLESALE_ITEMS: NavItem[] = [
  { href: "/admin/wholesale", tKey: "wholesale", Icon: BoxesIcon, match: "/admin/wholesale" },
  { href: "/admin/wholesale/purchase-requests", tKey: "purchaseRequests", Icon: ReceiptIcon, match: "/admin/wholesale/purchase-requests" },
];

// Secondary surfaces (Wave-2). The mobile bottom-tab grid stays five items, so
// these live in the desktop sidebar's "More" group and remain reachable there.
const MORE_ITEMS: NavItem[] = [
  { href: "/admin/tasks", tKey: "tasks", Icon: CheckCircleIcon, match: "/admin/tasks" },
  { href: "/admin/leads", tKey: "leads", Icon: UsersIcon, match: "/admin/leads" },
  { href: "/admin/themes", tKey: "themes", Icon: MenuIcon, match: "/admin/themes" },
  { href: "/admin/returns", tKey: "returns", Icon: UndoIcon, match: "/admin/returns" },
  { href: "/admin/cod", tKey: "cod", Icon: TruckIcon, match: "/admin/cod" },
  { href: "/admin/reports", tKey: "reports", Icon: ReceiptIcon, match: "/admin/reports" },
  { href: "/admin/marketing", tKey: "marketing", Icon: ChatIcon, match: "/admin/marketing" },
  { href: "/admin/reviews", tKey: "reviews", Icon: CheckCircleIcon, match: "/admin/reviews" },
  { href: "/admin/settings/shipping", tKey: "shipping", Icon: TruckIcon, match: "/admin/settings/shipping" },
  { href: "/admin/settings", tKey: "settings", Icon: ShieldIcon, match: "/admin/settings" },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/admin") return pathname === "/admin";
  return pathname.startsWith(item.match);
}

export function AdminNav({
  variant,
  tenantId,
  showWholesale = false,
}: {
  variant: "sidebar" | "tabs";
  tenantId: string;
  showWholesale?: boolean;
}) {
  const pathname = usePathname();
  const d = useDict();

  if (variant === "sidebar") {
    return (
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-5">
          <HybridLogo size="sm" />
          <span className="rounded-full bg-primary-weak px-2 py-0.5 text-2xs font-semibold text-primary">
            {d.admin.shell.badge}
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label={d.admin.shell.nav}>
          {ITEMS.map((item) => (
            <SidebarLink key={item.href} item={item} label={d.admin.nav[item.tKey]} active={isActive(pathname, item)} />
          ))}
          {showWholesale && (
            <>
              <div className="my-2 border-t border-border" />
              {WHOLESALE_ITEMS.map((item) => (
                <SidebarLink key={item.href} item={item} label={d.admin.nav[item.tKey]} active={isActive(pathname, item)} />
              ))}
            </>
          )}
          <div className="my-2 border-t border-border" />
          {MORE_ITEMS.map((item) => (
            <SidebarLink key={item.href} item={item} label={d.admin.nav[item.tKey]} active={isActive(pathname, item)} />
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
      aria-label={d.admin.shell.nav}
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
            {d.admin.nav[item.tKey]}
          </a>
        );
      })}
    </nav>
  );
}

function SidebarLink({ item, label, active }: { item: NavItem; label: string; active: boolean }) {
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
      {label}
    </a>
  );
}
