import { notFound } from "next/navigation";
import { getTenantContextBySlug } from "@/lib/storefront/data";
import { getDict } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/i18n/format";
import { withTenant } from "@hybrid/db";

interface WholesaleHomeProps {
  params: Promise<{ tenant: string }>;
}

// ── Row types ────────────────────────────────────────────────────────────────
interface WholesaleProductRow {
  id: string;
  title: string;
  slug: string;
  price: string | null;
  wholesale_price: string | null;
  moq: number | null;
  image_url: string | null;
  inventory: number | null;
  is_wholesale: boolean;
  wholesale_only: boolean;
}

// ── Wholesale product grid page ─────────────────────────────────────────────
export default async function WholesaleHome({ params }: WholesaleHomeProps) {
  const { tenant: slug } = await params;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) notFound();

  const { locale, d: _d } = await getDict();

  // Fetch wholesale products via withTenant (RLS-scoped, anonymous userId=null)
  const products = await withTenant(ctx.id, null, (tx) =>
    tx<WholesaleProductRow[]>`
      select
        p.id, p.title, p.slug, p.status,
        (select min(v.price) from product_variant v where v.product_id = p.id) as price,
        (select min(v.wholesale_price) from product_variant v where v.product_id = p.id) as wholesale_price,
        coalesce(p.moq, (select min(v.moq) from product_variant v where v.product_id = p.id)) as moq,
        (select i.url from product_image i where i.product_id = p.id order by i.position asc limit 1) as image_url,
        (select coalesce(sum(v.inventory_quantity), 0)::int from product_variant v where v.product_id = p.id) as inventory,
        p.is_wholesale, p.wholesale_only
      from product p
      where p.is_wholesale = true
        and p.status = 'active'
      order by p.created_at desc
    `,
  );

  return (
    <div className="mx-auto max-w-storefront px-4 pb-28 pt-4">
      <h1 className="bn-heading mb-2 text-xl font-bold text-ink">
        🏭 পাইকারি পণ্য
      </h1>
      <p className="bn-body mb-6 text-sm text-ink-muted">
        বাল্ক অর্ডার করুন এবং ব্যবসায়িক মূল্যে পণ্য কিনুন
      </p>

      {products.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="bn-body text-lg font-semibold text-ink">
            কোনো পণ্য পাওয়া যায়নি
          </p>
          <p className="bn-body text-sm text-ink-muted">
            পাইকারি পণ্য শীঘ্রই যুক্ত হবে
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.map((p) => {
            const displayPrice = p.wholesale_price ?? p.price;
            const retailPrice = p.price;
            const hasDiscount =
              p.wholesale_price != null &&
              Number(p.wholesale_price) < Number(p.price);

            return (
              <a
                key={p.id}
                href={`/wholesale/products/${p.slug}`}
                className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-md"
              >
                {/* Image */}
                <div className="relative aspect-square overflow-hidden bg-surface-2">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-ink-subtle">
                      <span className="bn-body text-xs">কোনো ছবি নেই</span>
                    </div>
                  )}
                  {/* MOQ badge */}
                  {p.moq != null && p.moq > 1 && (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-primary px-2 py-0.5 text-2xs font-semibold text-white">
                      MOQ: {p.moq}
                    </span>
                  )}
                  {/* Wholesale-only badge */}
                  {p.wholesale_only && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-500 px-2 py-0.5 text-2xs font-semibold text-white">
                      B2B
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="flex flex-col gap-1.5 p-3">
                  <h3 className="bn-body line-clamp-2 text-sm font-medium text-ink">
                    {p.title}
                  </h3>

                  {/* Price */}
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-bold text-primary tnum">
                      {displayPrice != null
                        ? formatMoney(Number(displayPrice), locale)
                        : "—"}
                    </span>
                    {hasDiscount && retailPrice != null && (
                      <span className="text-xs text-ink-subtle line-through tnum">
                        {formatMoney(Number(retailPrice), locale)}
                      </span>
                    )}
                  </div>

                  {/* MOQ + stock */}
                  <div className="flex items-center justify-between text-2xs text-ink-muted">
                    {p.moq != null && p.moq > 1 ? (
                      <span>ন্যূনতম: {p.moq}টি</span>
                    ) : (
                      <span>ন্যূনতম: ১টি</span>
                    )}
                    <span>
                      {p.inventory != null && p.inventory > 0
                        ? `স্টক: ${p.inventory}`
                        : "স্টক নেই"}
                    </span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
