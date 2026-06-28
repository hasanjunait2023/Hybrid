import Link from "next/link";
import { listMarketplaceProducts, getMarketplaceCategories } from "@/lib/marketplace/data";
import { ProductGrid } from "./ProductGrid";

// Marketplace home — category chips + cross-vendor product grid.
export default async function MarketHome() {
  const [products, categories] = await Promise.all([
    listMarketplaceProducts(),
    getMarketplaceCategories(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-2" aria-label="বিভাগ">
        {categories.map((c) => (
          <Link
            key={c.slug}
            href={`/category/${c.slug}`}
            className="rounded-full border border-border bg-surface px-3 py-1 text-sm hover:border-primary"
          >
            {c.nameBn}
          </Link>
        ))}
      </nav>
      <ProductGrid products={products} />
    </div>
  );
}
