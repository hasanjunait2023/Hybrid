import Link from "next/link";
import { getMarketplaceCategories } from "@/lib/marketplace/data";
import { listWholesaleProducts } from "@/lib/marketplace/wholesaleData";
import { WholesaleProductCard } from "./WholesaleProductCard";

// Wholesale home — sub-grid + category chips. Bengali-first.
export default async function WholesaleHome() {
  const [products, categories] = await Promise.all([
    listWholesaleProducts(),
    getMarketplaceCategories(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">পাইকারি বাজার</h1>
        <Link
          href="/wholesale/search"
          className="text-sm text-primary hover:underline"
        >
          সব দেখুন
        </Link>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="পাইকারি বিভাগ">
        {categories.map((c) => (
          <Link
            key={c.slug}
            href={`/wholesale/category/${c.slug}`}
            className="rounded-full border border-border bg-surface px-3 py-1 text-sm hover:border-primary"
          >
            {c.nameBn}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {products.map((p) => (
          <WholesaleProductCard key={p.productId} product={p} />
        ))}
      </div>

      {products.length === 0 && (
        <p className="py-16 text-center text-ink-muted">
          কোনো পাইকারি পণ্য পাওয়া যায়নি।
        </p>
      )}
    </div>
  );
}
