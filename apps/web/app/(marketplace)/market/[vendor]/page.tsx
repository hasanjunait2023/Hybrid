import { notFound } from "next/navigation";
import Link from "next/link";
import { getVendorProfile, getVendorProducts } from "@/lib/marketplace/data";
import { ProductGrid } from "../ProductGrid";

export default async function VendorProfilePage({
  params,
}: {
  params: Promise<{ vendor: string }>;
}) {
  const { vendor } = await params;
  const [profile, products] = await Promise.all([
    getVendorProfile(vendor),
    getVendorProducts(vendor),
  ]);
  if (!profile) notFound();

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-border bg-surface p-4">
        <h1 className="text-xl font-bold text-ink">{profile.vendorName}</h1>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-ink-muted">
          {profile.ratingCount > 0 ? (
            <span>★ {profile.ratingAvg.toFixed(1)} ({profile.ratingCount} রিভিউ)</span>
          ) : null}
          <span>{profile.productCount} টি পণ্য</span>
        </div>
        <Link href="/market" className="mt-3 inline-block text-sm text-primary">
          ← মার্কেটপ্লেসে ফিরুন
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-base font-semibold text-ink">সকল পণ্য</h2>
        <ProductGrid products={products} />
      </section>
    </div>
  );
}
