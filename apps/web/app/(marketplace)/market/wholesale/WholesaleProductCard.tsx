import Link from "next/link";
import { formatBdtBangla } from "@hybrid/ui";
import type { WholesaleListing } from "@/lib/marketplace/wholesaleData";

// Wholesale product card — shows MOQ + "Login for wholesale price" badge
// if anonymous, real price if the buyer is logged in.
// This is a server component; pricing visibility is handled at render time.
export function WholesaleProductCard({
  product,
  showPrice = false,
}: {
  product: WholesaleListing;
  showPrice?: boolean;
}) {
  return (
    <Link
      href={`/wholesale/${product.vendorSlug}/${product.productSlug}`}
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition hover:shadow-md"
    >
      <div className="aspect-square w-full bg-surface-2">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2">
        <h3 className="line-clamp-2 text-sm font-medium text-ink">{product.title}</h3>
        <p className="text-xs text-ink-muted">{product.vendorName}</p>

        {/* MOQ badge */}
        {product.moq ? (
          <span className="text-xs font-medium text-primary">
            সর্বনিম্ন অর্ডার: {product.moq} পিস
          </span>
        ) : null}

        <div className="mt-auto flex items-center justify-between">
          {showPrice ? (
            <span className="font-semibold text-ink">{formatBdtBangla(product.priceFrom)}</span>
          ) : (
            <span className="text-xs font-medium text-amber-600">
              মূল্য দেখতে লগইন করুন
            </span>
          )}
          {product.ratingCount > 0 ? (
            <span className="text-xs text-ink-muted">★ {product.ratingAvg.toFixed(1)}</span>
          ) : null}
        </div>

        {!product.inStock ? (
          <span className="text-xs text-danger">স্টক নেই</span>
        ) : null}

        {product.wholesaleOnly ? (
          <span className="text-xs text-amber-600">শুধুমাত্র পাইকারি</span>
        ) : null}
      </div>
    </Link>
  );
}
