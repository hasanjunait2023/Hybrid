import type { ReactNode } from "react";
import Link from "next/link";

export const dynamic = "force-dynamic";

// Marketplace ("Bazar") shell — app-like header with search + account, bottom
// tab bar for mobile (Home/Wishlist/Account/Wholesale), sticky top bar desktop.
// Retail | Wholesale is now in the bottom tab (mobile) and the sub-nav (desktop).
export default function MarketLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-2 text-ink">
      {/* ── Desktop + mobile top header ── */}
      <header className="sticky top-0 z-10 border-b border-border bg-surface shadow-xs">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          {/* Logo */}
          <Link
            href="/"
            className="shrink-0 text-base font-bold text-primary sm:text-lg"
          >
            হাইব্রিড বাজার
          </Link>

          {/* Search — full width, 44px tall */}
          <form action="/search" className="flex flex-1 items-center">
            <div className="relative flex w-full items-center">
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute left-3 h-4 w-4 text-ink-subtle"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="11" cy="11" r="8" />
                <path strokeLinecap="round" d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="search"
                name="q"
                placeholder="পণ্য খুঁজুন…"
                aria-label="পণ্য খুঁজুন"
                className="h-11 w-full rounded-full border border-border bg-surface-2 pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </form>

          {/* Desktop-only icons (mobile: bottom tab bar) */}
          <Link
            href="/cart"
            aria-label="কার্ট"
            className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2 sm:grid"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path strokeLinecap="round" d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          </Link>
          <Link
            href="/account"
            aria-label="আমার অ্যাকাউন্ট"
            className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2 sm:grid"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </Link>
        </div>

        {/* Desktop secondary nav — Retail | Wholesale */}
        <nav
          className="hidden border-t border-border sm:block"
          aria-label="বাজার মোড"
        >
          <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-1">
            <Link
              href="/"
              className="rounded-md px-3 py-2 text-sm font-medium text-ink-muted transition hover:bg-surface-2 hover:text-ink"
            >
              খুচরা
            </Link>
            <Link
              href="/wholesale"
              className="rounded-md px-3 py-2 text-sm font-medium text-ink-muted transition hover:bg-surface-2 hover:text-ink"
            >
              পাইকারি
            </Link>
          </div>
        </nav>
      </header>

      {/* Page content — bottom padding so fixed tab bar never covers content */}
      <main className="mx-auto max-w-5xl px-4 py-4 pb-24 sm:pb-4">{children}</main>

      {/* ── Mobile bottom tab bar ── */}
      <nav
        aria-label="নেভিগেশন"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-surface sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <TabLink href="/" icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 21V12h6v9" />
          </svg>
        } label="হোম" />
        <TabLink href="/account/wishlist" icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        } label="উইশলিস্ট" />
        <TabLink href="/cart" icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path strokeLinecap="round" d="M16 10a4 4 0 0 1-8 0" />
          </svg>
        } label="কার্ট" />
        <TabLink href="/account" icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        } label="অ্যাকাউন্ট" />
      </nav>
    </div>
  );
}

function TabLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-ink-muted transition-colors hover:text-primary active:text-primary"
    >
      {icon}
      <span className="text-2xs font-medium">{label}</span>
    </Link>
  );
}
