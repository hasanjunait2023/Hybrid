import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckIcon } from "@hybrid/ui";
import { ProductGrid } from "@hybrid/ui";
import {
  getRelatedProducts,
  getStorefrontProductBySlug,
  getStorefrontProductReviews,
  getTenantContextBySlug,
} from "@/lib/storefront/data";
import { getSizeChartForCategory } from "@/lib/products/sizeChart";
import { getDict } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/i18n/format";
import { AddToCart } from "./AddToCart";
import { OrderViaChat } from "./OrderViaChat";
import { ProductReviews } from "./ProductReviews";
import { ProductVideoGallery } from "./ProductVideoGallery";
import { SizeChartModal } from "@/components/storefront/SizeChartModal";

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

  const [reviews, related, sizeChart] = await Promise.all([
    getStorefrontProductReviews(ctx.id, product.id),
    getRelatedProducts(ctx.id, product.id),
    getSizeChartForCategory(ctx.id, product.productType),
  ]);

  const { locale, d } = await getDict();
  const isDiscounted =
    product.compareAtPrice != null && product.compareAtPrice > product.price;

  return (
    <div className="mx-auto max-w-storefront px-4 pb-28 pt-4 md:pb-8">
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
            {product.preorderEnabled && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                {d.storefront.product.preorder}
                {product.preorderAvailableAt
                  ? ` · ${new Date(product.preorderAvailableAt).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short" })}`
                  : ""}
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

          {/* R3 — per-category size guide modal. Hidden when the merchant has
              not published a chart for `product.product_type`. */}
          <SizeChartModal
            chart={sizeChart}
            labels={{
              trigger: d.storefront.product.sizeGuide,
              title: d.storefront.product.sizeChartTitle,
              close: d.storefront.product.sizeChartClose,
              unitInch: d.storefront.product.sizeChartUnitInch,
              unitCm: d.storefront.product.sizeChartUnitCm,
              hint: d.storefront.product.sizeChartHint,
            }}
          />

          {/* Chat-order fallback — BD buyers often prefer to confirm on WhatsApp/
              Messenger. Only renders when the store has a phone or FB page set. */}
          <OrderViaChat
            phone={ctx.store.phone}
            facebookUrl={ctx.store.facebookUrl}
            productTitle={product.title}
            labels={{
              orderOnWhatsapp: d.storefront.product.orderOnWhatsapp,
              orderOnMessenger: d.storefront.product.orderOnMessenger,
              chatOrderPrefix: d.storefront.product.chatOrderPrefix,
            }}
          />
        </div>
      </div>

      {/* R1 — product video carousel (lazy, Bengali-first). Sits below the
          image + buy box so it never pushes them above the fold on mobile. */}
      {product.videos?.length ? (
        <ProductVideoGallery
          videos={product.videos}
          labels={{
            videoSectionTitle: d.storefront.product.videoSectionTitle,
            videoPlay: d.storefront.product.videoPlay,
            videoPause: d.storefront.product.videoPause,
            videoUnavailable: d.storefront.product.videoUnavailable,
            videoMute: d.storefront.product.videoMute,
            videoUnmute: d.storefront.product.videoUnmute,
            prev:
              locale === "bn" ? "পূর্ববর্তী" : "Previous",
            next:
              locale === "bn" ? "পরবর্তী" : "Next",
          }}
        />
      ) : null}

      <ProductReviews
        data={reviews}
        tenantSlug={slug}
        productSlug={product.slug}
        locale={locale}
        labels={d.storefront.reviews}
      />

      {related.length > 0 && (
        <div className="mt-10 border-t border-border pt-2">
          <ProductGrid
            lang={locale}
            heading={d.storefront.products.related}
            products={related}
            priorityCount={0}
          />
        </div>
      )}
    </div>
  );
}
