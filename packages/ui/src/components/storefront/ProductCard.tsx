import { cn } from "../../lib/cn";
import { formatBdtBangla, formatBdtLatin } from "../../lib/format";
import { Badge } from "../Badge";
import { Button } from "../Button";
import { CheckIcon } from "../icons";
import type { StorefrontProduct } from "./types";

interface ProductCardProps {
  product: StorefrontProduct;
  /** Eager-load the first row's images; lazy-load the rest (DESIGN §6.4). */
  priority?: boolean;
  /** "en" (system default) or "bn" — pass the active locale from getDict/useDict. */
  lang?: "bn" | "en";
}

const COPY = {
  bn: {
    noImage: "ছবি নেই",
    sale: "সেল",
    outOfStock: "স্টক নেই",
    cod: "ক্যাশ অন ডেলিভারি",
    addToCart: "কার্টে যোগ করুন",
  },
  en: {
    noImage: "No image",
    sale: "Sale",
    outOfStock: "Out of stock",
    cod: "Cash on Delivery",
    addToCart: "Add to cart",
  },
} as const;

// DESIGN §6.3 anatomy: image · name · price (loudest) · COD chip · one action.
// Never more than 6 elements; price is the loudest thing after the image.
export function ProductCard({ product, priority = false, lang = "en" }: ProductCardProps) {
  const { title, slug, price, compareAtPrice, codEnabled = true } = product;
  const inStock = product.inStock ?? true;
  const isDiscounted =
    compareAtPrice != null && compareAtPrice > price && inStock;
  const t = COPY[lang];
  const money = lang === "bn" ? formatBdtBangla : formatBdtLatin;

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xs",
        "transition-[transform,box-shadow] duration-fast ease-out-soft",
        "md:hover:-translate-y-0.5 md:hover:shadow-md",
      )}
    >
      <a href={`/products/${slug}`} className="relative block">
        <div className="relative aspect-square overflow-hidden bg-surface-2">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={title}
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              className={cn(
                "h-full w-full object-cover",
                !inStock && "opacity-60",
              )}
            />
          ) : (
            <div
              className={cn(
                "grid h-full w-full place-items-center text-ink-subtle",
                !inStock && "opacity-60",
              )}
              aria-hidden
            >
              <span className="bn-body text-sm">{t.noImage}</span>
            </div>
          )}

          {isDiscounted && (
            <Badge tone="sale" className="absolute right-2 top-2">
              {t.sale}
            </Badge>
          )}
          {!inStock && (
            <Badge tone="danger" className="absolute left-2 top-2">
              {t.outOfStock}
            </Badge>
          )}
        </div>
      </a>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <a href={`/products/${slug}`}>
          <h3 className="bn-body line-clamp-2 text-sm font-medium text-ink md:text-base">
            {title}
          </h3>
        </a>

        <div className="mt-auto flex items-baseline gap-2">
          <span className="text-lg font-bold leading-none text-ink tnum">
            {money(price)}
          </span>
          {isDiscounted && compareAtPrice != null && (
            <span className="text-sm text-ink-subtle line-through tnum">
              {money(compareAtPrice)}
            </span>
          )}
        </div>

        {codEnabled && inStock && (
          <span className="inline-flex items-center gap-1 text-2xs font-semibold text-cod">
            <CheckIcon width={12} height={12} />
            {t.cod}
          </span>
        )}

        <Button variant="secondary" size="md" fullWidth disabled={!inStock}>
          {inStock ? t.addToCart : t.outOfStock}
        </Button>
      </div>
    </article>
  );
}
