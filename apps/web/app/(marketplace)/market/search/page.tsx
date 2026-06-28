import { listMarketplaceProducts } from "@/lib/marketplace/data";
import { ProductGrid } from "../ProductGrid";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const products = query ? await listMarketplaceProducts({ q: query }) : [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">
        {query ? `"${query}" — ফলাফল` : "অনুসন্ধান করুন"}
      </h1>
      {query ? <ProductGrid products={products} /> : null}
    </div>
  );
}
