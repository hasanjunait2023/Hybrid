import { cn } from "../../lib/cn";
import { formatBdtBangla } from "../../lib/format";
import { Badge } from "../Badge";
import { Button } from "../Button";
import { CheckIcon } from "../icons";
import type { StorefrontProduct } from "./types";

interface ProductCardProps {
  product: StorefrontProduct;
  /** Eager-load the first row's images; lazy-load the rest (DESIGN §6.4). */
  priority?: boolean;
}

// DESIGN §6.3 anatomy: image · name · price (loudest) · COD chip · one action.
// Never more than 6 elements; price is the loudest thing after the image.
export function ProductCard({ product, priority = false }: ProductCardProps) {
  const { title, slug, price, compareAtPrice, codEnabled = true } = product;
  const inStock = product.inStock ?? true;
  const isDiscounted =
    compareAtPrice != null && compareAtPrice > price && inStock;

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
              <span className="bn-body text-sm">ছবি নেই</span>
            </div>
          )}

          {isDiscounted && (
            <Badge tone="sale" className="absolute right-2 top-2">
              সেল
            </Badge>
          )}
          {!inStock && (
            <span className="absolute left-2 top-2 rounded-full bg-danger-weak px-2 py-0.5 text-2xs font-semibold text-danger">
              স্টক নেই
            </span>
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
            {formatBdtBangla(price)}
          </span>
          {isDiscounted && compareAtPrice != null && (
            <span className="text-sm text-ink-subtle line-through tnum">
              {formatBdtBangla(compareAtPrice)}
            </span>
          )}
        </div>

        {codEnabled && inStock && (
          <span className="inline-flex items-center gap-1 text-2xs font-semibold text-cod">
            <CheckIcon width={12} height={12} />
            ক্যাশ অন ডেলিভারি
          </span>
        )}

        <Button variant="secondary" size="md" fullWidth disabled={!inStock}>
          {inStock ? "কার্টে যোগ করুন" : "স্টক নেই"}
        </Button>
      </div>
    </article>
  );
}
