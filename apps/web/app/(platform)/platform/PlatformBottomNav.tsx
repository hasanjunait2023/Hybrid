"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, BoxesIcon, ChatIcon, ReceiptIcon, UsersIcon } from "@hybrid/ui";

// Mobile bottom tab bar for the super-admin console (lg:hidden). The desktop
// sidebar is hidden < lg; these 5 tabs cover the primary destinations. Active
// state from the browser path (host-mapped to /platform by middleware).
const TABS = [
  { href: "/platform", label: "Home", Icon: HomeIcon },
  { href: "/platform/tenants", label: "Stores", Icon: BoxesIcon },
  { href: "/platform/sales", label: "Sales", Icon: ChatIcon },
  { href: "/platform/finance", label: "Finance", Icon: ReceiptIcon },
  { href: "/platform/team", label: "Team", Icon: UsersIcon },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/platform") return pathname === "/platform" || pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PlatformBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-[var(--pf-border)] bg-[var(--pf-panel)] px-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {TABS.map((t) => {
        const active = isActive(pathname, t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-semibold ${active ? "text-[var(--pf-ink)]" : "text-[var(--pf-subtle)]"}`}
          >
            <span className={`flex h-8 w-12 items-center justify-center rounded-full ${active ? "bg-[var(--pf-yellow-soft)] text-[var(--pf-yellow-deep)]" : "text-[var(--pf-muted)]"}`}>
              <t.Icon className="h-[18px] w-[18px]" />
            </span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
