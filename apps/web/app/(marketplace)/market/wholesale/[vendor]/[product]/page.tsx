import { notFound } from "next/navigation";
import Link from "next/link";
import { formatBdtBangla } from "@hybrid/ui";
import { getWholesaleProduct, type WholesaleVariant } from "@/lib/marketplace/wholesaleData";
import { getBuyerSession } from "@/lib/marketplace/session";
import { getWishlistProductIds } from "@/lib/marketplace/wishlist";
import { WholesaleAddToCart } from "./WholesaleAddToCart";
import { WishlistButton } from "../../../account/wishlist/WishlistButton";

// Wholesale PDP — shows tier price table for verified B2B, login prompt for anonymous.
export default async function WholesaleProductPage({
  params,
}: {
  params: Promise<{ vendor: string; product: string }>;
}) {
  const { vendor, product: productSlug } = await params;
  const product = await getWholesaleProduct(vendor, productSlug);
  if (!product) notFound();

  const session = await getBuyerSession();
  const showPrice = session !== null;
  const wishlistIds = session
    ? await getWishlistProductIds(session.buyerId)
    : new Set<string>();
  const isSaved = wishlistIds.has(product.productId);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 md:grid-cols-2">
        {/* Image */}
        <div className="aspect-square w-full overflow-hidden rounded-lg bg-surface-2">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover" />
          ) : null}
        </div>

        {/* Details */}
        <div className="flex flex-col gap-3">
          <h1 className="text-xl font-bold text-ink">{product.title}</h1>
          <Link href={`/wholesale/${product.vendorSlug}`} className="inline-flex min-h-[44px] items-center text-sm text-ink-muted">
            বিক্রেতা: {product.vendorName}
          </Link>

          {/* MOQ */}
          {product.moq ? (
            <p className="text-sm font-medium text-primary">
              সর্বনিম্ন অর্ডার: {product.moq} পিস
            </p>
          ) : null}

          {/* Pricing section */}
          {showPrice ? (
            <>
              <p className="text-2xl font-bold text-primary">
                {formatBdtBangla(product.priceFrom)}
              </p>
              {product.ratingCount > 0 ? (
                <p className="text-sm text-ink-muted">
                  ★ {product.ratingAvg.toFixed(1)} ({product.ratingCount} রিভিউ)
                </p>
              ) : null}

              {/* Tier price table */}
              {product.wholesaleVariants.some((v) => v.tierPrices.length > 0) && (
                <TierPriceTable variants={product.wholesaleVariants} />
              )}

              <div className="flex flex-wrap items-center gap-2">
                <WholesaleAddToCart product={product} />
                <WishlistButton
                  productId={product.productId}
                  listingId={product.listingId}
                  initialSaved={isSaved}
                />
              </div>
            </>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-800">
                পাইকারি মূল্য দেখতে লগইন করুন
              </p>
              <p className="mt-1 text-xs text-amber-600">
                শুধুমাত্র যাচাইকৃত পাইকারি ক্রেতাদের জন্য পাইকারি মূল্য ও টায়ার প্রাইস দেখানো হয়।
              </p>
              <Link
                href={`/wholesale/login?next=/wholesale/${product.vendorSlug}/${product.productSlug}`}
                className="mt-3 inline-flex min-h-[44px] items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
              >
                লগইন / রেজিস্টার
              </Link>
            </div>
          )}

          {product.description ? (
            <p className="whitespace-pre-line text-sm text-ink-subtle">
              {product.description}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Tier price table component ──────────────────────────────────────────────

function TierPriceTable({
  variants,
}: {
  variants: WholesaleVariant[];
}) {
  // Collect all unique tier thresholds across variants
  const allTiers = new Set<number>();
  for (const v of variants) {
    for (const t of v.tierPrices) {
      allTiers.add(t.min_qty);
    }
  }
  const sortedTiers = [...allTiers].sort((a, b) => a - b);

  if (sortedTiers.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            <th className="px-3 py-2 font-medium">ভ্যারিয়েন্ট</th>
            {sortedTiers.map((qty) => (
              <th key={qty} className="px-3 py-2 font-medium">
                {qty}+ পিস
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => {
            const priceMap = new Map(
              v.tierPrices.map((t) => [t.min_qty, t.unit_price]),
            );
            return (
              <tr key={v.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-ink-muted">
                  {v.title ?? "ডিফল্ট"}
                </td>
                {sortedTiers.map((qty) => {
                  const price = priceMap.get(qty);
                  return (
                    <td key={qty} className="px-3 py-2 font-medium text-ink">
                      {price != null ? formatBdtBangla(price) : "—"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
