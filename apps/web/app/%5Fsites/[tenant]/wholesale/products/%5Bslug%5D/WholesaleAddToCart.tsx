"use client";
// Wholesale PDP add-to-cart island with MOQ enforcement and tier pricing display.
import { useState } from "react";
import { Button } from "@hybrid/ui";
import { useDict, useLocale } from "@/lib/i18n/provider";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { useWholesaleCart } from "../../cart/useWholesaleCart";

interface VariantInfo {
  id: string;
  title: string | null;
  price: number;
  wholesalePrice: number | null;
  compareAtPrice: number | null;
  inStock: boolean;
  inventoryQuantity: number;
  moq: number | null;
  tierPrices: { minQty: number; price: number }[];
}

interface WholesaleProductInfo {
  id: string;
  title: string;
  slug: string;
  moq: number | null;
  imageUrl: string | null;
  variants: VariantInfo[];
}

interface WholesaleAddToCartProps {
  tenantSlug: string;
  product: WholesaleProductInfo;
  defaultVariant: VariantInfo;
}

export function WholesaleAddToCart({
  tenantSlug,
  product,
  defaultVariant,
}: WholesaleAddToCartProps) {
  const d = useDict();
  const locale = useLocale();
  const t = d.storefront.product;
  const cart = useWholesaleCart(tenantSlug);

  const inStockVariants = product.variants.filter((v) => v.inStock);
  const [variantId, setVariantId] = useState<string>(
    inStockVariants[0]?.id ?? defaultVariant.id,
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [added, setAdded] = useState(false);

  const selected = product.variants.find((v) => v.id === variantId) ?? defaultVariant;
  const canBuy = Boolean(selected?.inStock);
  const effectiveMoq = selected?.moq ?? product.moq ?? 1;
  const displayPrice = selected?.wholesalePrice ?? selected?.price ?? 0;
  const meetsMoq = quantity >= effectiveMoq;

  // Compute tier price for current quantity
  const tierPrices = selected?.tierPrices ?? [];
  const applicableTier = [...tierPrices]
    .reverse()
    .find((t) => quantity >= t.minQty);
  const unitPrice = applicableTier?.price ?? displayPrice;
  const lineTotal = unitPrice * quantity;

  function handleAdd() {
    if (!selected || !canBuy || !meetsMoq) return;
    cart.add(
      {
        variantId: selected.id,
        productSlug: product.slug,
        title: product.title,
        variantTitle: selected.title,
        price: unitPrice,
        imageUrl: product.imageUrl,
      },
      quantity,
    );
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Variant picker */}
      {product.variants.length > 1 && (
        <div className="flex flex-col gap-2">
          <span className="bn-body text-sm font-semibold text-ink">
            {t.variant ?? "ভেরিয়েন্ট"}
          </span>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  setVariantId(v.id);
                  setQuantity(1);
                }}
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
                {v.title ?? t.defaultVariant}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quantity selector with MOQ enforcement */}
      <div className="flex flex-col gap-1.5">
        <span className="bn-body text-sm font-semibold text-ink">
          পরিমাণ (MOQ: {effectiveMoq})
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="পরিমাণ কমান"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="grid h-11 w-11 place-items-center rounded-md border border-border-strong text-ink hover:bg-surface-2"
          >
            −
          </button>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 1) setQuantity(v);
            }}
            className="h-11 w-20 rounded-md border border-border-strong bg-surface text-center text-base font-semibold text-ink tnum"
          />
          <button
            type="button"
            aria-label="পরিমাণ বাড়ান"
            onClick={() => setQuantity(quantity + 1)}
            className="grid h-11 w-11 place-items-center rounded-md border border-border-strong text-ink hover:bg-surface-2"
          >
            +
          </button>
          {!meetsMoq && (
            <span className="text-xs font-medium text-danger">
              ন্যূনতম {effectiveMoq}টি প্রয়োজন
            </span>
          )}
        </div>
      </div>

      {/* Tier pricing preview */}
      {tierPrices.length > 0 && (
        <div className="rounded-md bg-surface-2 p-2">
          <span className="text-xs font-medium text-ink-muted">টায়ার মূল্য:</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {tierPrices.map((tier, i) => (
              <span
                key={i}
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  quantity >= tier.minQty
                    ? "bg-primary-weak text-primary"
                    : "bg-surface text-ink-muted"
                }`}
              >
                {tier.minQty}+ → {formatMoney(tier.price, locale)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Line total */}
      <div className="flex items-center justify-between rounded-md bg-surface-2 p-2">
        <span className="text-sm text-ink-muted">মোট মূল্য:</span>
        <span className="text-lg font-bold text-primary tnum">
          {formatMoney(lineTotal, locale)}
        </span>
      </div>

      {/* Inline action (md+) */}
      <div className="hidden items-center gap-3 md:flex">
        <Button
          variant="primary"
          size="lg"
          onClick={handleAdd}
          disabled={!canBuy || !meetsMoq}
        >
          {!canBuy
            ? t.outOfStock
            : added
              ? "✅ যুক্ত হয়েছে"
              : "🛒 কার্টে যোগ করুন"}
        </Button>
        <a
          href="/wholesale/cart"
          className="grid h-12 place-items-center rounded-md border border-border-strong px-4 text-sm font-semibold text-primary hover:bg-surface-2"
        >
          কার্ট ({formatNumber(cart.count, locale)})
        </a>
      </div>

      {/* Mobile sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface shadow-lg md:hidden">
        <div className="mx-auto flex max-w-storefront items-center gap-3 px-4 py-2.5">
          <div className="flex flex-col">
            <span className="text-2xs text-ink-muted">মোট</span>
            <span className="text-lg font-bold leading-none text-primary tnum">
              {formatMoney(lineTotal, locale)}
            </span>
          </div>
          <a
            href="/wholesale/cart"
            aria-label="কার্ট দেখুন"
            className="grid h-11 shrink-0 place-items-center rounded-md border border-border-strong px-3 text-sm font-semibold text-primary"
          >
            কার্ট ({formatNumber(cart.count, locale)})
          </a>
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={handleAdd}
            disabled={!canBuy || !meetsMoq}
          >
            {!canBuy
              ? t.outOfStock
              : added
                ? "✅ যুক্ত হয়েছে"
                : "🛒 কার্টে যোগ করুন"}
          </Button>
        </div>
      </div>
    </div>
  );
}
