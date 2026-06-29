import { listMarketplaceProducts, getMarketplaceCategories } from "@/lib/marketplace/data";
import { ProductGrid } from "../../ProductGrid";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [products, categories] = await Promise.all([
    listMarketplaceProducts({ categorySlug: slug }),
    getMarketplaceCategories(),
  ]);
  const category = categories.find((c) => c.slug === slug);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">{category?.nameBn ?? slug}</h1>
      <ProductGrid products={products} />
    </div>
  );
}
