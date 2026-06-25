import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listReviews, getReviewStats, type ReviewStatus } from "@/lib/admin/reviews";
import { PageHeader, StatStrip, StatCard } from "../_ui";
import { ReviewRow } from "./ReviewRow";

// Product reviews moderation (tenant roadmap P3-1). Default to the pending
// queue; approve/reject each. Approved reviews + average rating surface on the
// storefront. Admin = Latin numerals.
export const dynamic = "force-dynamic";

interface ReviewsPageProps {
  searchParams: Promise<{ status?: string }>;
}

const STATUSES: { value: string; bn: string }[] = [
  { value: "pending", bn: "অপেক্ষমাণ" },
  { value: "approved", bn: "অনুমোদিত" },
  { value: "rejected", bn: "বাতিল" },
];

export default async function ReviewsPage({ searchParams }: ReviewsPageProps) {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const sp = await searchParams;
  const status = (["pending", "approved", "rejected"].includes(sp.status ?? "") ? sp.status : "pending") as ReviewStatus;

  const [reviews, stats] = await Promise.all([
    listReviews(tenantId, session.userId, status),
    getReviewStats(tenantId, session.userId),
  ]);

  return (
    <div lang="en" className="space-y-4">
      <PageHeader title="রিভিউ" subtitle={`${stats.pending} টি অপেক্ষমাণ`} />

      <StatStrip>
        <StatCard label="অপেক্ষমাণ" value={String(stats.pending)} tone={stats.pending > 0 ? "pending" : "muted"} />
        <StatCard label="অনুমোদিত" value={String(stats.approved)} tone="success" />
        <StatCard label="গড় রেটিং" value={stats.avgRating > 0 ? stats.avgRating.toFixed(2) : "—"} />
        <StatCard label="মোট" value={String(stats.pending + stats.approved)} />
      </StatStrip>

      <div className="flex gap-2">
        {STATUSES.map((s) => {
          const active = status === s.value;
          return (
            <a
              key={s.value}
              href={`/admin/reviews?status=${s.value}`}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                active ? "bg-primary text-ink-on-primary" : "border border-border bg-surface text-ink-muted hover:bg-surface-2"
              }`}
            >
              {s.bn}
            </a>
          );
        })}
      </div>

      {reviews.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-ink-muted">
          কোনো রিভিউ নেই।
        </p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <ReviewRow key={r.id} review={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
