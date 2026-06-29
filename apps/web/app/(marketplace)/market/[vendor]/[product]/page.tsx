import { notFound } from "next/navigation";
import Link from "next/link";
import { formatBdtBangla } from "@hybrid/ui";
import { getMarketplaceProduct } from "@/lib/marketplace/data";
import { getProductReviews } from "@/lib/marketplace/reviews";
import { AddToCart } from "./AddToCart";
import { ReviewForm } from "./ReviewForm";

export default async function MarketProductPage({
  params,
}: {
  params: Promise<{ vendor: string; product: string }>;
}) {
  const { vendor, product: productSlug } = await params;
  const product = await getMarketplaceProduct(vendor, productSlug);
  if (!product) notFound();

  const reviews = await getProductReviews(product.productId);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="aspect-square w-full overflow-hidden rounded-lg bg-surface-2">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="flex flex-col gap-3">
          <h1 className="text-xl font-bold text-ink">{product.title}</h1>
          <Link href={`/category`} className="text-sm text-ink-muted">
            বিক্রেতা: {product.vendorName}
          </Link>
          <p className="text-2xl font-bold text-primary">{formatBdtBangla(product.priceFrom)}</p>
          {product.ratingCount > 0 ? (
            <p className="text-sm text-ink-muted">
              ★ {product.ratingAvg.toFixed(1)} ({product.ratingCount} রিভিউ)
            </p>
          ) : null}
          <AddToCart product={product} />
          {product.description ? (
            <p className="whitespace-pre-line text-sm text-ink-subtle">{product.description}</p>
          ) : null}
        </div>
      </div>

      <section aria-labelledby="reviews-h" className="border-t border-border pt-4">
        <h2 id="reviews-h" className="mb-3 text-lg font-semibold">
          রিভিউ
        </h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-ink-muted">এখনো কোনো রিভিউ নেই।</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-md border border-border bg-surface p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">★ {r.rating}</span>
                  {r.verifiedPurchase ? (
                    <span className="text-xs text-cod">যাচাইকৃত ক্রয়</span>
                  ) : null}
                </div>
                {r.body ? <p className="mt-1 text-sm text-ink-subtle">{r.body}</p> : null}
              </li>
            ))}
          </ul>
        )}
        <ReviewForm productId={product.productId} />
      </section>
    </div>
  );
}
