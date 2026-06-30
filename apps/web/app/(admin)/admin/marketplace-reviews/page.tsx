import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { listPendingReviews } from "@/lib/marketplace/reviews";
import { ModerateButtons } from "./ModerateButtons";

export const dynamic = "force-dynamic";

// Vendor moderation queue for marketplace reviews on this store's products.
export default async function MarketplaceReviewsPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const pending = await listPendingReviews(tenantId, session.userId);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">মার্কেটপ্লেস রিভিউ মডারেশন</h1>
      {pending.length === 0 ? (
        <p className="text-ink-muted">অপেক্ষমাণ কোনো রিভিউ নেই।</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{r.productTitle}</span>
                <span className="text-sm">{"★".repeat(r.rating)}</span>
              </div>
              {r.body ? <p className="text-sm text-ink-subtle">{r.body}</p> : null}
              <ModerateButtons reviewId={r.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
