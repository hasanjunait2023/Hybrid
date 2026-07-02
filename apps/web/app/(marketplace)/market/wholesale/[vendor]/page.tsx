import { notFound } from "next/navigation";
import Link from "next/link";
import { getBuyerSession } from "@/lib/marketplace/session";
import {
  getWholesaleVendorProfile,
  getWholesaleVendorProducts,
} from "@/lib/marketplace/wholesaleData";
import { WholesaleProductCard } from "../WholesaleProductCard";

export default async function WholesaleVendorPage({
  params,
}: {
  params: Promise<{ vendor: string }>;
}) {
  const { vendor } = await params;
  const [profile, products, session] = await Promise.all([
    getWholesaleVendorProfile(vendor),
    getWholesaleVendorProducts(vendor),
    getBuyerSession(),
  ]);
  if (!profile) notFound();

  const showPrice = session !== null;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-border bg-surface p-4">
        <h1 className="text-xl font-bold text-ink">{profile.vendorName}</h1>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-ink-muted">
          {profile.ratingCount > 0 ? (
            <span>★ {profile.ratingAvg.toFixed(1)} ({profile.ratingCount} রিভিউ)</span>
          ) : null}
          <span>{profile.productCount} টি পাইকারি পণ্য</span>
        </div>
        <Link href="/wholesale" className="mt-3 inline-block text-sm text-primary">
          ← পাইকারি মার্কেটে ফিরুন
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-base font-semibold text-ink">সকল পাইকারি পণ্য</h2>
        {products.length === 0 ? (
          <p className="py-16 text-center text-ink-muted">কোনো পণ্য পাওয়া যায়নি।</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {products.map((p) => (
              <WholesaleProductCard key={p.productId} product={p} showPrice={showPrice} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
