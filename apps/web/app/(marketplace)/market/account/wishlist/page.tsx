import Link from "next/link";
import { formatBdtBangla } from "@hybrid/ui";
import { getBuyerSession } from "@/lib/marketplace/session";
import { getWishlistItems } from "@/lib/marketplace/wishlist";

export default async function WishlistPage() {
  const session = await getBuyerSession();
  if (!session) {
    return (
      <div className="py-12 text-center">
        <p className="text-ink-muted">উইশলিস্ট দেখতে লগইন করুন।</p>
        <Link href="/login?next=/account/wishlist" className="mt-3 inline-block text-primary">
          লগইন
        </Link>
      </div>
    );
  }

  const items = await getWishlistItems(session.buyerId);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">আমার উইশলিস্ট</h1>
      {items.length === 0 ? (
        <p className="text-ink-muted">
          উইশলিস্ট খালি।{" "}
          <Link href="/" className="text-primary">
            কেনাকাটা করুন
          </Link>
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {items.map((p) => (
            <Link
              key={p.productId}
              href={`/${p.vendorSlug}/${p.productSlug}`}
              className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition hover:shadow-md"
            >
              <div className="aspect-square w-full bg-surface-2">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-2">
                <h3 className="line-clamp-2 text-sm font-medium text-ink">{p.title}</h3>
                <p className="text-xs text-ink-muted">{p.vendorName}</p>
                <div className="mt-auto flex items-center justify-between">
                  <span className="font-semibold text-ink">{formatBdtBangla(p.priceFrom)}</span>
                  {p.ratingCount > 0 ? (
                    <span className="text-xs text-ink-muted">★ {p.ratingAvg.toFixed(1)}</span>
                  ) : null}
                </div>
                {!p.inStock ? <span className="text-xs text-danger">স্টক নেই</span> : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
