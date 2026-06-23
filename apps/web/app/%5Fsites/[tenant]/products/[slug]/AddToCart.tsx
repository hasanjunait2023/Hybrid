"use client";
// PDP add-to-cart island (DESIGN §6.1 #8 sticky bottom action bar). Picks a
// variant (when there's more than one), adds to the localStorage cart, and shows
// a quick add-to-cart confirmation. The sticky bar is the COD conversion anchor.
import { useState } from "react";
import { Button, formatBdtBangla } from "@hybrid/ui";
import { useCart } from "../../cart/useCart";
import type { StorefrontProductDetail } from "@/lib/storefront/data";

interface AddToCartProps {
  tenantSlug: string;
  product: StorefrontProductDetail;
}

export function AddToCart({ tenantSlug, product }: AddToCartProps) {
  const cart = useCart(tenantSlug);
  const inStockVariants = product.variants.filter((v) => v.inStock);
  const [variantId, setVariantId] = useState<string>(
    inStockVariants[0]?.id ?? product.variants[0]?.id ?? "",
  );
  const [added, setAdded] = useState(false);

  const selected =
    product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const canBuy = Boolean(selected?.inStock);
  const price = selected?.price ?? product.price;

  function handleAdd() {
    if (!selected || !canBuy) return;
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
          <span className="bn-body text-sm font-semibold text-ink">ভ্যারিয়েন্ট</span>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                disabled={!v.inStock}
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
                {v.title ?? "ডিফল্ট"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Inline action (md+); the sticky bar covers mobile. */}
      <div className="hidden items-center gap-3 md:flex">
        <span className="text-2xl font-bold leading-none text-ink tnum">
          {formatBdtBangla(price)}
        </span>
        <Button variant="primary" size="lg" onClick={handleAdd} disabled={!canBuy}>
          {canBuy ? (added ? "যোগ হয়েছে ✓" : "কার্টে যোগ করুন") : "স্টক নেই"}
        </Button>
        <a
          href="/cart"
          className="grid h-12 place-items-center rounded-md border border-border-strong px-4 text-sm font-semibold text-primary hover:bg-surface-2"
        >
          কার্ট ({cart.count})
        </a>
      </div>

      {/* Mobile sticky action bar (DESIGN §6.1 #8). */}
      <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface shadow-lg md:hidden">
        <div className="mx-auto flex max-w-storefront items-center gap-3 px-4 py-2.5">
          <div className="flex flex-col">
            <span className="text-2xs text-ink-muted">মূল্য</span>
            <span className="text-lg font-bold leading-none text-ink tnum">
              {formatBdtBangla(price)}
            </span>
          </div>
          <a
            href="/cart"
            aria-label="কার্ট দেখুন"
            className="grid h-11 shrink-0 place-items-center rounded-md border border-border-strong px-3 text-sm font-semibold text-primary"
          >
            কার্ট ({cart.count})
          </a>
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={handleAdd}
            disabled={!canBuy}
          >
            {canBuy ? (added ? "যোগ হয়েছে ✓" : "কার্টে যোগ করুন") : "স্টক নেই"}
          </Button>
        </div>
      </div>
    </div>
  );
}
