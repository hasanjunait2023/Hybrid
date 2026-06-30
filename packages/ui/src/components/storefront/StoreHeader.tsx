import type { ReactNode } from "react";
import { toBnDigits } from "../../lib/format";
import { CartIcon, PhoneIcon, SearchIcon } from "../icons";
import type { StoreIdentity } from "./types";

interface StoreHeaderProps {
  store: StoreIdentity;
  cartCount?: number;
  /** "en" (system default) or "bn" — pass the active locale from getDict/useDict. */
  lang?: "bn" | "en";
  /** Language toggle control, passed in by the app (different package owns it). */
  toggle?: ReactNode;
}

const COPY = {
  bn: {
    trust: "ক্যাশ অন ডেলিভারি · সারা দেশে ডেলিভারি",
    search: "খুঁজুন",
    cart: "কার্ট",
  },
  en: {
    trust: "Cash on Delivery · Nationwide delivery",
    search: "Search",
    cart: "Cart",
  },
} as const;

// DESIGN §6.1 — sticky header.
//   Row 1: COD trust strip (cod-green), always above the fold.
//   Row 2: logo · search · cart(count) · language toggle.
export function StoreHeader({ store, cartCount = 0, lang = "en", toggle }: StoreHeaderProps) {
  const phone = store.phone ?? "";
  const t = COPY[lang];

  return (
    <header className="sticky top-0 z-sticky bg-surface">
      {/* Row 1 — trust strip */}
      <div className="bg-cod-weak text-cod">
        <div className="mx-auto flex max-w-storefront items-center justify-between gap-2 px-4 py-2 text-xs sm:gap-3">
          <span className="bn-body font-semibold">
            {t.trust}
          </span>
          {phone && (
            <a
              href={`tel:${phone}`}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1 font-semibold hover:underline"
            >
              <PhoneIcon width={13} height={13} />
              {lang === "bn" ? toBnDigits(phone) : phone}
            </a>
          )}
        </div>
      </div>

      {/* Row 2 — main bar */}
      <div className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-storefront items-center gap-3 px-4 md:h-16">
          <a
            href="/"
            className="bn-heading mr-auto truncate text-xl font-bold text-ink"
          >
            {store.name}
          </a>

          <button
            type="button"
            aria-label={t.search}
            className="grid h-11 w-11 place-items-center rounded-md text-ink-muted hover:bg-surface-2"
          >
            <SearchIcon />
          </button>

          <a
            href="/cart"
            aria-label={t.cart}
            className="relative grid h-11 w-11 place-items-center rounded-md text-ink-muted hover:bg-surface-2"
          >
            <CartIcon />
            {cartCount > 0 && (
              <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-2xs font-bold text-ink-on-primary">
                {lang === "bn" ? toBnDigits(cartCount) : String(cartCount)}
              </span>
            )}
          </a>

          {toggle}
        </div>
      </div>
    </header>
  );
}
