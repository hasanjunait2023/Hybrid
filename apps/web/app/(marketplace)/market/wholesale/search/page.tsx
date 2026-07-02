import { listWholesaleProducts } from "@/lib/marketplace/wholesaleData";
import { getBuyerSession } from "@/lib/marketplace/session";
import { WholesaleProductCard } from "../WholesaleProductCard";

// Wholesale search page.
export default async function WholesaleSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const [products, session] = await Promise.all([
    query ? listWholesaleProducts({ q: query }) : Promise.resolve([]),
    getBuyerSession(),
  ]);
  const showPrice = session !== null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">
        {query
          ? `"${query}" — পাইকারি ফলাফল`
          : "পাইকারি পণ্য অনুসন্ধান করুন"}
      </h1>
      {query ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {products.map((p) => (
            <WholesaleProductCard key={p.productId} product={p} showPrice={showPrice} />
          ))}
        </div>
      ) : null}
      {query && products.length === 0 && (
        <p className="py-16 text-center text-ink-muted">
          "{query}" — কোনো পাইকারি পণ্য পাওয়া যায়নি।
        </p>
      )}
    </div>
  );
}
