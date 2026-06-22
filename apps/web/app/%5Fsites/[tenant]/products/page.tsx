import { notFound } from "next/navigation";
import { ProductGrid } from "@hybrid/ui";
import { getStorefrontProducts, getTenantContextBySlug } from "@/lib/storefront/data";

interface ProductsPageProps {
  params: Promise<{ tenant: string }>;
}

// Product list (blueprint §7). Same cached read as the home grid; full catalog.
export default async function ProductsPage({ params }: ProductsPageProps) {
  const { tenant: slug } = await params;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) notFound();

  const products = await getStorefrontProducts(ctx.id);

  return (
    <div className="pt-4">
      <ProductGrid heading="সব পণ্য" products={products} priorityCount={4} />
    </div>
  );
}
