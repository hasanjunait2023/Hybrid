import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckIcon } from "@hybrid/ui";
import { getTenantContextBySlug } from "@/lib/storefront/data";
import { getDict } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/i18n/format";
import { withTenant } from "@hybrid/db";
import { WholesaleAddToCart } from "./WholesaleAddToCart";

interface WholesalePDPProps {
  params: Promise<{ tenant: string; slug: string }>;
}

// ── Row types ────────────────────────────────────────────────────────────────
interface ProductRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  moq: number | null;
  wholesale_only: boolean;
}

interface VariantRow {
  id: string;
  title: string | null;
  price: string;
  wholesale_price: string | null;
  compare_at_price: string | null;
  inventory_quantity: number;
  track_inventory: boolean;
  moq: number | null;
  tier_prices: unknown;
}

// ── SEO ────────────────────────────────────────────────────────────────────
export async function generateMetadata({
  params,
}: WholesalePDPProps): Promise<Metadata> {
  const { tenant: slug, slug: productSlug } = await params;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) return { title: "পাইকারি পণ্য" };
  const product = await getWholesaleProduct(ctx.id, productSlug);
  if (!product) return { title: "পাইকারি পণ্য" };
  const description =
    product.description?.replace(/\s+/g, " ").trim().slice(0, 160) ??
    `${product.title} — ${ctx.store.name}`;
  return {
    title: `${product.title} — ${ctx.store.name} (পাইকারি)`,
    description,
    openGraph: {
      title: product.title,
      description,
      images: product.imageUrl ? [{ url: product.imageUrl }] : undefined,
      type: "website",
    },
  };
}

// ── Data fetch ─────────────────────────────────────────────────────────────
async function getWholesaleProduct(tenantId: string, slug: string) {
  return withTenant(tenantId, null, async (tx) => {
    const rows = await tx<ProductRow[]>`
      select id, title, slug, description, moq, wholesale_only
        from product
       where slug = ${slug}
         and status = 'active'
         and is_wholesale = true
       limit 1
    `;
    const row = rows[0];
    if (!row) return null;

    const variants = await tx<VariantRow[]>`
      select id, title, price, wholesale_price, compare_at_price,
             inventory_quantity, track_inventory, moq, tier_prices
        from product_variant
       where product_id = ${row.id}
         and is_active = true
       order by price asc
    `;

    const imageRows = await tx<{ url: string }[]>`
      select url from product_image
       where product_id = ${row.id}
       order by position asc
       limit 1
    `;

    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      description: row.description,
      moq: row.moq,
      wholesaleOnly: row.wholesale_only,
      imageUrl: imageRows[0]?.url ?? null,
      variants: variants.map((v) => ({
        id: v.id,
        title: v.title,
        price: Number(v.price),
        wholesalePrice: v.wholesale_price != null ? Number(v.wholesale_price) : null,
        compareAtPrice: v.compare_at_price != null ? Number(v.compare_at_price) : null,
        inStock: !v.track_inventory || v.inventory_quantity > 0,
        inventoryQuantity: v.inventory_quantity,
        moq: v.moq,
        tierPrices: parseTierPrices(v.tier_prices),
      })),
    };
  });
}

function parseTierPrices(raw: unknown): { minQty: number; price: number }[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .filter((t): t is { minQty?: number; price?: number } =>
      typeof t === "object" && t !== null,
    )
    .map((t) => ({
      minQty: t.minQty ?? 0,
      price: t.price ?? 0,
    }))
    .sort((a, b) => a.minQty - b.minQty);
}

// ── PDP Component ──────────────────────────────────────────────────────────
export default async function WholesalePDP({ params }: WholesalePDPProps) {
  const { tenant: slug, slug: productSlug } = await params;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) notFound();

  const product = await getWholesaleProduct(ctx.id, productSlug);
  if (!product) notFound();

  const { locale, d } = await getDict();
  const t = d.storefront.product;

  // Pick the first in-stock variant for initial display
  const defaultVariant =
    product.variants.find((v) => v.inStock) ?? product.variants[0];
  if (!defaultVariant) notFound();
  const wholesalePrice = defaultVariant.wholesalePrice ?? null;
  const retailPrice = defaultVariant?.price ?? 0;
  const hasDiscount = wholesalePrice != null && wholesalePrice < retailPrice;
  const displayPrice = wholesalePrice ?? retailPrice;
  const effectiveMoq = defaultVariant?.moq ?? product.moq ?? 1;
  const tierPrices = defaultVariant?.tierPrices ?? [];

  return (
    <div className="mx-auto max-w-storefront px-4 pb-28 pt-4">
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
              <span className="bn-body text-sm">{t.noImage}</span>
            </div>
          )}
          {product.wholesaleOnly && (
            <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white">
              শুধুমাত্র পাইকারি
            </span>
          )}
        </div>

        {/* Detail */}
        <div className="flex flex-col gap-4">
          <h1 className="bn-heading text-2xl font-bold text-ink">{product.title}</h1>

          {/* Price */}
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold leading-none text-primary tnum">
              {formatMoney(displayPrice, locale)}
            </span>
            {hasDiscount && (
              <span className="text-base text-ink-subtle line-through tnum">
                {formatMoney(retailPrice, locale)}
              </span>
            )}
          </div>

          {/* MOQ */}
          <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-weak px-3 py-1 text-xs font-semibold text-primary">
            📦 ন্যূনতম অর্ডার: {effectiveMoq}টি
          </div>

          {/* COD trust */}
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-cod-weak px-3 py-1 text-xs font-semibold text-cod">
            <CheckIcon width={14} height={14} />
            {d.storefront.product.codTrust}
          </span>

          {/* Description */}
          {product.description && (
            <p className="bn-body whitespace-pre-line text-base text-ink-muted">
              {product.description}
            </p>
          )}

          {/* Tier pricing table */}
          {tierPrices.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-3">
              <h3 className="bn-body mb-2 text-sm font-semibold text-ink">
                📊 টায়ার মূল্য (Tier Pricing)
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-ink-muted">
                    <th className="pb-1 pr-3 font-medium">পরিমাণ</th>
                    <th className="pb-1 font-medium">ইউনিট মূল্য</th>
                  </tr>
                </thead>
                <tbody>
                  {tierPrices.map((tier, i) => (
                    <tr key={i} className="border-b border-border-weak last:border-0">
                      <td className="py-1.5 pr-3 text-ink">{tier.minQty}+</td>
                      <td className="py-1.5 font-semibold text-primary tnum">
                        {formatMoney(tier.price, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Variant picker + add to cart */}
          <WholesaleAddToCart
            tenantSlug={slug}
            product={product}
            defaultVariant={defaultVariant!}
          />
        </div>
      </div>
    </div>
  );
}
