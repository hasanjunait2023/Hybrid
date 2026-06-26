import { ProductCard } from "./ProductCard";
import type { StorefrontProduct } from "./types";

interface ProductGridProps {
  products: StorefrontProduct[];
  heading?: string;
  /** Eager-load the first N cards (above-the-fold first row). */
  priorityCount?: number;
  /** "en" (system default) or "bn" — pass the active locale from getDict/useDict. */
  lang?: "bn" | "en";
}

const EMPTY = {
  bn: {
    message: "এই মুহূর্তে কোনো পণ্য নেই।",
    hint: "শীঘ্রই নতুন পণ্য যোগ হবে।",
    cta: "হোমপেজে ফিরে যান",
  },
  en: {
    message: "No products right now.",
    hint: "New products are coming soon.",
    cta: "Back to home",
  },
} as const;

// DESIGN §6.1 #4 — 2-col mobile (BD norm), 3 (md) → 4 (lg) → 5 (xl).
// Gap tightens on mobile (space-3) and opens up from sm (space-4).
export function ProductGrid({
  products,
  heading,
  priorityCount = 2,
  lang = "en",
}: ProductGridProps) {
  if (products.length === 0) {
    const t = EMPTY[lang];
    return (
      <div
        className="mx-auto flex max-w-storefront flex-col items-center gap-3 px-4 py-16 text-center"
        role="status"
      >
        <p className="bn-body text-lg font-semibold text-ink">{t.message}</p>
        <p className="bn-body text-sm text-ink-muted">{t.hint}</p>
        <a
          href="/"
          className="mt-2 inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-white transition hover:bg-primary-hover"
        >
          {t.cta}
        </a>
      </div>
    );
  }

  return (
    <section className="px-4 py-section" aria-labelledby={heading ? "grid-heading" : undefined}>
      <div className="mx-auto max-w-storefront">
        {heading && (
          <h2 id="grid-heading" className="bn-heading mb-4 text-2xl font-bold text-ink">
            {heading}
          </h2>
        )}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.map((product, i) => (
            <ProductCard
              key={product.id}
              product={product}
              priority={i < priorityCount}
              lang={lang}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
