import { formatBdtBangla } from "../../lib/format";
import { Button } from "../Button";
import { ChatIcon } from "../icons";

interface StickyActionBarProps {
  price: number;
  /** Messenger / WhatsApp fallback for the Messenger-first crowd. */
  chatHref?: string | null;
  orderLabel?: string;
}

// DESIGN §6.1 #8 — fixed bottom bar on the product page: price (left) + big
// primary "অর্ডার করুন" (right) + chat fallback. The conversion anchor for COD
// buyers. Inline CTA replaces it from md+ (handled by the md:hidden wrapper on
// the consuming page); here we render the mobile bar.
export function StickyActionBar({
  price,
  chatHref,
  orderLabel = "অর্ডার করুন",
}: StickyActionBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface shadow-lg md:hidden">
      <div className="mx-auto flex max-w-storefront items-center gap-3 px-4 py-2.5">
        <div className="flex flex-col">
          <span className="text-2xs text-ink-muted">মূল্য</span>
          <span className="text-lg font-bold leading-none text-ink tnum">
            {formatBdtBangla(price)}
          </span>
        </div>

        {chatHref && (
          <a
            href={chatHref}
            aria-label="মেসেজ করুন"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-border-strong text-primary hover:bg-surface-2"
          >
            <ChatIcon />
          </a>
        )}

        <Button variant="primary" size="lg" className="flex-1">
          {orderLabel}
        </Button>
      </div>
    </div>
  );
}
