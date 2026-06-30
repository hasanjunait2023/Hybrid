"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  BoxesIcon,
  ReceiptIcon,
  ShieldIcon,
  CheckCircleIcon,
  UsersIcon,
  ChatIcon,
  HybridLogo,
} from "@hybrid/ui";
import { useDict } from "@/lib/i18n/provider";

// Super-admin console sidebar (Homies-Lab skin). Primary destinations render as
// a 2-up grid of tiles (active = soft-black); below them a pinned-shortcuts list
// and a roadmap list of modules still being built (no dead links). Active state
// is resolved from the *browser* path — on app.{root} the middleware maps the
// host onto /platform, so usePathname returns "/platform…" (and "/" on the bare
// root, which we treat as the dashboard).

interface NavItem {
  href: string;
  labelKey: keyof ReturnType<typeof useDict>["platform"]["nav"];
  Icon: (p: { className?: string }) => React.ReactElement;
}

const TILES: NavItem[] = [
  { href: "/platform", labelKey: "dashboard", Icon: HomeIcon },
  { href: "/platform/tenants", labelKey: "tenants", Icon: BoxesIcon },
  { href: "/platform/wholesale-kyc", labelKey: "wholesaleKyc", Icon: ShieldIcon },
  { href: "/platform/marketplace-fees", labelKey: "marketFees", Icon: ReceiptIcon },
  { href: "/platform/finance", labelKey: "finance", Icon: ReceiptIcon },
  { href: "/platform/plans", labelKey: "plans", Icon: ShieldIcon },
  { href: "/platform/billing", labelKey: "billing", Icon: CheckCircleIcon },
  { href: "/platform/team", labelKey: "team", Icon: UsersIcon },
];

const SHORTCUTS: { href: string; labelKey: keyof ReturnType<typeof useDict>["platform"]["nav"] }[] = [
  { href: "/platform/tenants", labelKey: "shortcutLiveStores" },
  { href: "/platform/finance", labelKey: "shortcutRevenueMrr" },
  { href: "/platform", labelKey: "shortcutNewSignups" },
];

// "Manage" modules. Items with an href are live; the rest show a "Soon" badge.
const ROADMAP: { labelKey: keyof ReturnType<typeof useDict>["platform"]["nav"]; href?: string; Icon: (p: { className?: string }) => React.ReactElement }[] = [
  { labelKey: "roadmapSales", href: "/platform/sales", Icon: ChatIcon },
  { labelKey: "roadmapMarketing", href: "/platform/marketing", Icon: ChatIcon },
  { labelKey: "roadmapSupport", href: "/platform/support", Icon: ChatIcon },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/platform") return pathname === "/platform" || pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PlatformSidebar({ adminName }: { adminName: string }) {
  const pathname = usePathname();
  const d = useDict();
  const n = d.platform.nav;

  return (
    <aside className="hidden w-[244px] shrink-0 flex-col gap-5 border-r border-[var(--pf-border)] bg-[var(--pf-panel)] px-4 py-5 lg:flex">
      {/* Brand */}
      <Link href="/platform" className="flex items-center gap-2 px-1">
        <HybridLogo size="sm" />
        <span className="rounded-full bg-[var(--pf-yellow-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--pf-yellow-deep)]">
          Admin
        </span>
      </Link>

      {/* Search */}
      <label className="flex items-center gap-2 rounded-xl border border-[var(--pf-border)] bg-[var(--pf-hover)] px-3 py-2 text-[var(--pf-muted)] focus-within:border-[var(--pf-yellow)]">
        <SearchIcon className="h-3.5 w-3.5" />
        <input
          type="search"
          placeholder={n.searchPlaceholder}
          className="w-full bg-transparent text-[13px] text-[var(--pf-ink)] outline-none placeholder:text-[var(--pf-subtle)]"
        />
      </label>

      {/* Primary nav tiles */}
      <nav aria-label="Primary" className="grid grid-cols-2 gap-2">
        {TILES.map((t) => {
          const active = isActive(pathname, t.href);
          return (
            <Link key={t.href} href={t.href} className="pf-navtile" data-active={active}>
              <span className="pf-navtile-icon">
                <t.Icon className="h-4 w-4" />
              </span>
              <span className="text-[12.5px] font-semibold leading-tight">{n[t.labelKey]}</span>
            </Link>
          );
        })}
      </nav>

      {/* Pinned shortcuts */}
      <div>
        <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--pf-subtle)]">
          {n.favorite}
        </p>
        <ul className="space-y-0.5">
          {SHORTCUTS.map((s) => (
            <li key={s.labelKey}>
              <Link
                href={s.href}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-[var(--pf-muted)] hover:bg-[var(--pf-hover)] hover:text-[var(--pf-ink)]"
              >
                <span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--pf-yellow)]" aria-hidden="true" />
                {n[s.labelKey]}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Roadmap modules */}
      <div>
        <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--pf-subtle)]">
          {n.manage}
        </p>
        <ul className="space-y-0.5">
          {ROADMAP.map((m) => {
            const inner = (
              <>
                <span className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--pf-border)] bg-[var(--pf-hover)]">
                  <m.Icon className="h-3.5 w-3.5" />
                </span>
                {n[m.labelKey]}
                {!m.href && (
                  <span className="ml-auto rounded-full bg-[var(--pf-yellow-soft)] px-1.5 py-0.5 text-[8px] font-semibold uppercase text-[var(--pf-yellow-deep)]">
                    {n.soon}
                  </span>
                )}
              </>
            );
            return m.href ? (
              <li key={m.labelKey}>
                <Link
                  href={m.href}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-[var(--pf-muted)] hover:bg-[var(--pf-hover)] hover:text-[var(--pf-ink)]"
                >
                  {inner}
                </Link>
              </li>
            ) : (
              <li
                key={m.labelKey}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-[var(--pf-subtle)]"
              >
                {inner}
              </li>
            );
          })}
        </ul>
      </div>

      {/* User card */}
      <div className="mt-auto flex items-center gap-2.5 rounded-xl bg-[var(--pf-black)] px-3 py-2.5 text-[var(--pf-on-black)]">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--pf-yellow)] text-[13px] font-bold text-[var(--pf-black)]">
          {adminName.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[12.5px] font-semibold leading-tight">{adminName}</span>
          <span className="block text-[10px] text-white/55">Super Admin</span>
        </span>
        <BellIcon className="ml-auto h-4 w-4 text-white/60" />
      </div>
    </aside>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
