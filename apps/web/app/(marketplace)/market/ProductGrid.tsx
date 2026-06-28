import Link from "next/link";
import { formatBdtBangla } from "@hybrid/ui";
import type { MpListing } from "@/lib/marketplace/data";

// Shared 2-col mobile grid for browse/search/category. Server component.
export function ProductGrid({ products }: { products: MpListing[] }) {
  if (products.length === 0) {
    return <p className="py-16 text-center text-ink-muted">কোনো পণ্য পাওয়া যায়নি।</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {products.map((p) => (
        <Link
          key={p.productId}
          href={`/${p.vendorSlug}/${p.productSlug}`}
          className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition hover:shadow-md"
        >
          <div className="aspect-square w-full bg-surface-2">
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="flex flex-1 flex-col gap-1 p-2">
            <h3 className="line-clamp-2 text-sm font-medium text-ink">{p.title}</h3>
            <p className="text-xs text-ink-muted">{p.vendorName}</p>
            <div className="mt-auto flex items-center justify-between">
              <span className="font-semibold text-ink">{formatBdtBangla(p.priceFrom)}</span>
              {p.ratingCount > 0 ? (
                <span className="text-xs text-ink-muted">★ {p.ratingAvg.toFixed(1)}</span>
              ) : null}
            </div>
            {!p.inStock ? <span className="text-xs text-danger">স্টক নেই</span> : null}
          </div>
        </Link>
      ))}
    </div>
  );
}
