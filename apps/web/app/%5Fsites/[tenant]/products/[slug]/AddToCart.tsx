"use client";
// PDP add-to-cart island (DESIGN §6.1 #8 sticky bottom action bar). Picks a
// variant (when there's more than one), adds to the localStorage cart, and shows
// a quick add-to-cart confirmation. The sticky bar is the COD conversion anchor.
import { useState } from "react";
import { Button } from "@hybrid/ui";
import { useDict, useLocale } from "@/lib/i18n/provider";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { useCart } from "../../cart/useCart";
import type { StorefrontProductDetail } from "@/lib/storefront/data";

interface AddToCartProps {
  tenantSlug: string;
  product: StorefrontProductDetail;
}

export function AddToCart({ tenantSlug, product }: AddToCartProps) {
  const d = useDict();
  const locale = useLocale();
  const t = d.storefront.product;
  const cart = useCart(tenantSlug);
  const inStockVariants = product.variants.filter((v) => v.inStock);
  const [variantId, setVariantId] = useState<string>(
    inStockVariants[0]?.id ?? product.variants[0]?.id ?? "",
  );
  const [added, setAdded] = useState(false);

  const selected =
    product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const canBuy = Boolean(selected?.inStock);
  const isPreorder = !canBuy && Boolean(selected?.preorderEnabled);
  const canAdd = canBuy || isPreorder;
  const price = selected?.price ?? product.price;

  function handleAdd() {
    if (!selected || !canAdd) return;

    // Fire the client-side AddToCart pixel event before the cart update so the
    // event is tied to the click (and, if the user bounces before storage
    // completes, the event still fired). The global helper is injected by the
    // storefront layout's StorefrontTracker on hydration.
    if (typeof window !== "undefined") {
      const helper = (window as unknown as { __hybridFireAddToCart?: (p: { id: string; name: string; price: number; quantity?: number }) => string }).__hybridFireAddToCart;
      if (helper) {
        try {
          helper({
            id: selected.id,
            name: `${product.title}${selected.title ? ` — ${selected.title}` : ""}`,
            price: selected.price,
            quantity: 1,
          });
        } catch {
          // Analytics must never block add-to-cart.
        }
      }
    }

    cart.add({
      variantId: selected.id,
      productSlug: product.slug,
      title: product.title,
      variantTitle: selected.title,
      price: selected.price,
      imageUrl: product.imageUrl,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }

  return (
    <div className="flex flex-col gap-4">
      {product.variants.length > 1 && (
        <div className="flex flex-col gap-2">
          <span className="bn-body text-sm font-semibold text-ink">{t.variant}</span>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                disabled={!v.inStock && !v.preorderEnabled}
                aria-pressed={v.id === variantId}
                className={[
                  "min-h-11 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  v.id === variantId
                    ? "border-primary bg-primary-weak text-primary"
                    : "border-border-strong bg-surface text-ink hover:bg-surface-2",
                  !v.inStock && "cursor-not-allowed opacity-50",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {v.title ?? t.defaultVariant}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Inline action (md+); the sticky bar covers mobile. */}
      <div className="hidden items-center gap-3 md:flex">
        <span className="text-2xl font-bold leading-none text-ink tnum">
          {formatMoney(price, locale)}
        </span>
        <Button variant="primary" size="lg" onClick={handleAdd} disabled={!canAdd}>
          {canBuy ? (added ? t.added : t.addToCart) : isPreorder ? t.preorder : t.outOfStock}
        </Button>
        <a
          href="/cart"
          className="grid h-12 place-items-center rounded-md border border-border-strong px-4 text-sm font-semibold text-primary hover:bg-surface-2"
        >
          {t.cart} ({formatNumber(cart.count, locale)})
        </a>
      </div>

      {/* Mobile sticky action bar (DESIGN §6.1 #8). */}
      <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface shadow-lg md:hidden">
        <div className="mx-auto flex max-w-storefront items-center gap-3 px-4 py-2.5">
          <div className="flex flex-col">
            <span className="text-2xs text-ink-muted">{t.price}</span>
            <span className="text-lg font-bold leading-none text-ink tnum">
              {formatMoney(price, locale)}
            </span>
          </div>
          <a
            href="/cart"
            aria-label={t.viewCart}
            className="grid h-11 shrink-0 place-items-center rounded-md border border-border-strong px-3 text-sm font-semibold text-primary"
          >
            {t.cart} ({formatNumber(cart.count, locale)})
          </a>
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={handleAdd}
            disabled={!canAdd}
          >
            {canBuy ? (added ? t.added : t.addToCart) : isPreorder ? t.preorder : t.outOfStock}
          </Button>
        </div>
      </div>
    </div>
  );
}
