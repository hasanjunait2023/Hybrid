import { cn } from "../../lib/cn";
import { toBnDigits } from "../../lib/format";
import { CartIcon, PhoneIcon, SearchIcon } from "../icons";
import type { StoreIdentity } from "./types";

interface StoreHeaderProps {
  store: StoreIdentity;
  cartCount?: number;
}

// DESIGN §6.1 — sticky header.
//   Row 1: COD trust strip (cod-green), always above the fold.
//   Row 2: logo · search · cart(count) · language toggle.
export function StoreHeader({ store, cartCount = 0 }: StoreHeaderProps) {
  const phone = store.phone ?? "";

  return (
    <header className="sticky top-0 z-sticky bg-surface">
      {/* Row 1 — trust strip */}
      <div className="bg-cod-weak text-cod">
        <div className="mx-auto flex max-w-storefront items-center justify-between gap-3 px-4 py-1.5 text-xs">
          <span className="bn-body font-semibold">
            ক্যাশ অন ডেলিভারি · সারা দেশে ডেলিভারি
          </span>
          {phone && (
            <a
              href={`tel:${phone}`}
              className="inline-flex shrink-0 items-center gap-1 font-semibold hover:underline"
            >
              <PhoneIcon width={13} height={13} />
              {toBnDigits(phone)}
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
            aria-label="খুঁজুন"
            className="grid h-11 w-11 place-items-center rounded-md text-ink-muted hover:bg-surface-2"
          >
            <SearchIcon />
          </button>

          <a
            href="/cart"
            aria-label="কার্ট"
            className="relative grid h-11 w-11 place-items-center rounded-md text-ink-muted hover:bg-surface-2"
          >
            <CartIcon />
            {cartCount > 0 && (
              <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-2xs font-bold text-ink-on-primary">
                {toBnDigits(cartCount)}
              </span>
            )}
          </a>

          <LanguageToggle />
        </div>
      </div>
    </header>
  );
}

// Bangla is default (active). The English path is wired in a later phase; the
// control is present so the header anatomy matches DESIGN §6.1.
function LanguageToggle() {
  return (
    <div
      className="hidden items-center overflow-hidden rounded-full border border-border-strong text-xs font-semibold sm:flex"
      role="group"
      aria-label="ভাষা"
    >
      <span className={cn("bg-primary px-2.5 py-1 text-ink-on-primary")}>বাং</span>
      <span className="px-2.5 py-1 text-ink-muted">EN</span>
    </div>
  );
}
