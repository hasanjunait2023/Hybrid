import { notFound } from "next/navigation";
import { CheckIcon, formatBdtBangla } from "@hybrid/ui";
import {
  getStorefrontProductBySlug,
  getTenantContextBySlug,
} from "@/lib/storefront/data";
import { AddToCart } from "./AddToCart";

interface ProductDetailPageProps {
  params: Promise<{ tenant: string; slug: string }>;
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
              <span className="bn-body text-sm">ছবি নেই</span>
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="flex flex-col gap-4">
          <h1 className="bn-heading text-2xl font-bold text-ink">{product.title}</h1>

          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold leading-none text-ink tnum">
              {formatBdtBangla(product.price)}
            </span>
            {isDiscounted && product.compareAtPrice != null && (
              <span className="text-base text-ink-subtle line-through tnum">
                {formatBdtBangla(product.compareAtPrice)}
              </span>
            )}
          </div>

          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-cod-weak px-3 py-1 text-xs font-semibold text-cod">
            <CheckIcon width={14} height={14} />
            ক্যাশ অন ডেলিভারি · হাতে পেয়ে টাকা দিন
          </span>

          {product.description && (
            <p className="bn-body whitespace-pre-line text-sm text-ink-muted">
              {product.description}
            </p>
          )}

          <AddToCart tenantSlug={slug} product={product} />
        </div>
      </div>
    </div>
  );
}
