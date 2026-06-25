import { notFound } from "next/navigation";
import { ProductGrid } from "@hybrid/ui";
import { getStorefrontProducts, getTenantContextBySlug } from "@/lib/storefront/data";
import { getDict } from "@/lib/i18n/server";

interface ProductsPageProps {
  params: Promise<{ tenant: string }>;
}

// Product list (blueprint §7). Same cached read as the home grid; full catalog.
export default async function ProductsPage({ params }: ProductsPageProps) {
  const { tenant: slug } = await params;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) notFound();

  const products = await getStorefrontProducts(ctx.id);
  const { locale, d } = await getDict();

  return (
    <div className="pt-4">
      <ProductGrid
        lang={locale}
        heading={d.storefront.products.allProducts}
        products={products}
        priorityCount={4}
      />
    </div>
  );
}
