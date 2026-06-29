import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckIcon } from "@hybrid/ui";
import {
  getStorefrontProductBySlug,
  getTenantContextBySlug,
} from "@/lib/storefront/data";
import { getApprovedProductReviews, getProductRating } from "@/lib/admin/reviews";
import { getDict } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/i18n/format";
import { writeProductViewed } from "@/lib/analytics/internal";
import { AddToCart } from "./AddToCart";
import { ReviewSection } from "./ReviewSection";

interface ProductDetailPageProps {
  params: Promise<{ tenant: string; slug: string }>;
}

// SEO (Phase 1 storefront polish — P1.1): per-product title + description +
// OpenGraph image so social shares and search snippets actually render product
// info instead of the bare template. Bengali title falls back to Latin when the
// product only has a Latin name; same for description.
export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { tenant: slug, slug: productSlug } = await params;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) return { title: "Product" };
  const product = await getStorefrontProductBySlug(ctx.id, productSlug);
  if (!product) return { title: "Product" };
  const description =
    product.description?.replace(/\s+/g, " ").trim().slice(0, 160) ??
    `${product.title} — ${ctx.store.name}`;
  return {
    title: `${product.title} — ${ctx.store.name}`,
    description,
    openGraph: {
      title: product.title,
      description,
      images: product.imageUrl ? [{ url: product.imageUrl }] : undefined,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: product.title,
      description,
      images: product.imageUrl ? [product.imageUrl] : undefined,
    },
  };
}

// PDP (blueprint §7, DESIGN P1 / §6.3). Server-rendered detail via the cached
// storefront data layer (withTenant userId=null, per-product cache tags). The
// add-to-cart + variant picker + sticky bar are the one client island.
export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { tenant: slug, slug: productSlug } = await params;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) notFound();

  const product = await getStorefrontProductBySlug(ctx.id, productSlug);
  if (!product) notFound();

  const [reviews, rating] = await Promise.all([
    getApprovedProductReviews(ctx.id, product.id),
    getProductRating(ctx.id, null, product.id),
  ]);

  // Fire non-blocking product.viewed internal event (first-party analytics).
  void writeProductViewed(ctx.id, { productId: product.id, productSlug: product.slug, title: product.title });

  const { locale, d } = await getDict();
  const isDiscounted =
    product.compareAtPrice != null && product.compareAtPrice > product.price;

  return (
    <div className="mx-auto max-w-storefront px-4 pb-28 pt-4 md:pb-8">
      {/* Star rating summary above the product grid */}
      {rating.count > 0 && (
        <div className="mb-3 flex items-center gap-1.5 text-sm text-ink-muted">
          <span className="text-accent">{'★'.repeat(Math.round(rating.average))}{'☆'.repeat(5 - Math.round(rating.average))}</span>
          <span className="font-semibold text-ink tnum">{rating.average.toFixed(1)}</span>
          <span>({rating.count} রিভিউ)</span>
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-2 md:gap-8">
        {/* Image */}
        <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-surface-2">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.title}
              fetchPriority="high"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-ink-subtle">
              <span className="bn-body text-sm">{d.storefront.product.noImage}</span>
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="flex flex-col gap-4">
          <h1 className="bn-heading text-2xl font-bold text-ink">{product.title}</h1>

          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold leading-none text-ink tnum">
              {formatMoney(product.price, locale)}
            </span>
            {isDiscounted && product.compareAtPrice != null && (
              <span className="text-base text-ink-subtle line-through tnum">
                {formatMoney(product.compareAtPrice, locale)}
              </span>
            )}
          </div>

          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-cod-weak px-3 py-1 text-xs font-semibold text-cod">
            <CheckIcon width={14} height={14} />
            {d.storefront.product.codTrust}
          </span>

          {product.description && (
            <p className="bn-body whitespace-pre-line text-base text-ink-muted">
              {product.description}
            </p>
          )}

          <AddToCart tenantSlug={slug} product={product} />
        </div>
      </div>

      <ReviewSection
        tenantSlug={slug}
        productId={product.id}
        initialReviews={reviews}
        avgRating={rating.average}
        reviewCount={rating.count}
      />
    </div>
  );
}
