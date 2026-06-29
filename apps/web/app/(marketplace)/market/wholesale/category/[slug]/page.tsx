import { getMarketplaceCategories } from "@/lib/marketplace/data";
import { listWholesaleProducts } from "@/lib/marketplace/wholesaleData";
import { WholesaleProductCard } from "../../WholesaleProductCard";

// Wholesale category filter page.
export default async function WholesaleCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [products, categories] = await Promise.all([
    listWholesaleProducts({ categorySlug: slug }),
    getMarketplaceCategories(),
  ]);
  const category = categories.find((c) => c.slug === slug);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">
        {category?.nameBn ?? slug} — পাইকারি
      </h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {products.map((p) => (
          <WholesaleProductCard key={p.productId} product={p} />
        ))}
      </div>
      {products.length === 0 && (
        <p className="py-16 text-center text-ink-muted">
          এই বিভাগে কোনো পাইকারি পণ্য পাওয়া যায়নি।
        </p>
      )}
    </div>
  );
}
