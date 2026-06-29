import type { ReactNode } from "react";
import Link from "next/link";

export const dynamic = "force-dynamic";

// Marketplace ("Bazar") shell — header with search, cart, account, and
// Retail | Wholesale toggle. Bengali-first.
// Uses separate routes: /market (retail) and /market/wholesale (wholesale).
// Separate routes are cleaner than ?section= query params because they:
// 1. Preserve sub-routes (category, search, PDP) without param forwarding
// 2. Work with App Router's natural route matching
// 3. Avoid query-param state-loss on navigation
export default function MarketLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-2 text-ink">
      <header className="sticky top-0 z-10 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/" className="shrink-0 text-lg font-bold text-primary">
            হাইব্রিড বাজার
          </Link>
          <form action="/search" className="flex flex-1 items-center">
            <input
              type="search"
              name="q"
              placeholder="পণ্য খুঁজুন…"
              aria-label="পণ্য খুঁজুন"
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </form>
          <Link href="/cart" className="shrink-0 px-2 py-2 text-sm font-medium" aria-label="কার্ট">
            🛒
          </Link>
          <Link
            href="/account/orders"
            className="shrink-0 px-2 py-2 text-sm font-medium"
            aria-label="আমার অর্ডার"
          >
            👤
          </Link>
        </div>
        {/* Retail | Wholesale toggle — separate routes, no redirect */}
        <nav className="mx-auto flex max-w-5xl items-center gap-1 px-4 pb-2" aria-label="বাজার মোড">
          <Link
            href="/market"
            className="rounded-md px-3 py-1 text-sm font-medium transition hover:bg-surface-2"
          >
            খুচরা
          </Link>
          <Link
            href="/market/wholesale"
            className="rounded-md px-3 py-1 text-sm font-medium transition hover:bg-surface-2"
          >
            পাইকারি
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-4">{children}</main>
    </div>
  );
}
