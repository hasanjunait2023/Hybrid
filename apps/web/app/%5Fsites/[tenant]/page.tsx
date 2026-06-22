import { notFound } from "next/navigation";
import { Hero, ProductGrid, TrustBand } from "@hybrid/ui";
import { getStorefrontProducts, getTenantContextBySlug } from "@/lib/storefront/data";

interface StorefrontHomeProps {
  params: Promise<{ tenant: string }>;
}

// Home (blueprint §7/§8): hero + featured products + trust band. Doreja theme,
// Bengali strings, Bangla numerals (prices via formatBdtBangla in the cards).
// ISR via unstable_cache in the data layer (revalidate 3600 + per-tenant tags).
export default async function StorefrontHome({ params }: StorefrontHomeProps) {
  const { tenant: slug } = await params;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) notFound();

  const products = await getStorefrontProducts(ctx.id);

  return (
    <>
      <Hero
        heading={`${ctx.store.name} — আসল পণ্য, সারা দেশে ডেলিভারি`}
        subheading="ক্যাশ অন ডেলিভারিতে অর্ডার করুন, হাতে পেয়ে টাকা দিন।"
        ctaLabel="এখনই কিনুন"
        ctaHref="/products"
      />
      <ProductGrid heading="ফিচার্ড পণ্য" products={products} priorityCount={2} />
      <TrustBand />
    </>
  );
}
