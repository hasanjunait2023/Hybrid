"use client";
// Cart page island (blueprint S-CHECKOUT). Renders the localStorage cart with
// qty steppers + remove, a Bangla-numeral subtotal, and a sticky "চেকআউট" bar.
// No server cart — everything is client state until checkout (DESIGN P1.5).
import { Button, TrashIcon } from "@hybrid/ui";
import { useDict, useLocale } from "@/lib/i18n/provider";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { useCart } from "./useCart";

interface CartIslandProps {
  tenantSlug: string;
}

export function CartIsland({ tenantSlug }: CartIslandProps) {
  const d = useDict();
  const locale = useLocale();
  const t = d.storefront.cart;
  const cart = useCart(tenantSlug);

  if (cart.lines.length === 0) {
    return (
      <div className="mx-auto flex max-w-storefront flex-col items-center gap-4 px-4 py-16 text-center">
        <p className="bn-body text-lg font-semibold text-ink">{t.empty}</p>
        <p className="bn-body text-sm text-ink-muted">{t.emptyHint}</p>
        <a href="/products">
          <Button variant="primary" size="lg">{t.viewProducts}</Button>
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-storefront px-4 pb-28 pt-4">
      <h1 className="bn-heading mb-4 text-xl font-bold text-ink">{t.title}</h1>

      <ul className="flex flex-col gap-3">
        {cart.lines.map((line) => (
          <li
            key={line.variantId}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3"
          >
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-surface-2">
              {line.imageUrl && (
                <img src={line.imageUrl} alt={line.title} className="h-full w-full object-cover" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="bn-body line-clamp-1 text-sm font-medium text-ink">{line.title}</p>
              {line.variantTitle && (
                <p className="text-2xs text-ink-muted">{line.variantTitle}</p>
              )}
              <p className="text-sm font-bold text-ink tnum">{formatMoney(line.price, locale)}</p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label={t.decrease}
                onClick={() => cart.setQuantity(line.variantId, line.quantity - 1)}
                className="grid h-9 w-9 place-items-center rounded-md border border-border-strong text-ink hover:bg-surface-2"
              >
                −
              </button>
              <span className="w-7 text-center text-sm font-semibold text-ink tnum">
                {formatNumber(line.quantity, locale)}
              </span>
              <button
                type="button"
                aria-label={t.increase}
                onClick={() => cart.setQuantity(line.variantId, line.quantity + 1)}
                className="grid h-9 w-9 place-items-center rounded-md border border-border-strong text-ink hover:bg-surface-2"
              >
                +
              </button>
              <button
                type="button"
                aria-label={t.remove}
                onClick={() => cart.remove(line.variantId)}
                className="grid h-9 w-9 place-items-center rounded-md text-danger hover:bg-danger-weak"
              >
                <TrashIcon width={16} height={16} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Sticky checkout bar (DESIGN P1.6 pattern). */}
      <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface shadow-lg">
        <div className="mx-auto flex max-w-storefront items-center gap-3 px-4 py-2.5">
          <div className="flex flex-col">
            <span className="text-2xs text-ink-muted">{t.total}</span>
            <span className="text-lg font-bold leading-none text-ink tnum">
              {formatMoney(cart.subtotal, locale)}
            </span>
          </div>
          <a href="/checkout" className="flex-1">
            <Button variant="primary" size="lg" fullWidth>
              {t.checkout}
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}
