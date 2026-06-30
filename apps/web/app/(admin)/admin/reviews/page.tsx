import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { listReviews, getReviewStats, type ReviewStatus } from "@/lib/admin/reviews";
import { getDict } from "@/lib/i18n/server";
import { formatNumber } from "@/lib/i18n/format";
import { PageHeader, StatStrip, StatCard } from "../_ui";
import { ReviewRow } from "./ReviewRow";

// Product reviews moderation (tenant roadmap P3-1). Default to the pending
// queue; approve/reject each. Approved reviews + average rating surface on the
// storefront. Admin = Latin numerals.
export const dynamic = "force-dynamic";

interface ReviewsPageProps {
  searchParams: Promise<{ status?: string }>;
}

const STATUSES = [
  { value: "pending" },
  { value: "approved" },
  { value: "rejected" },
] as const;

export default async function ReviewsPage({ searchParams }: ReviewsPageProps) {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const sp = await searchParams;
  const status = (["pending", "approved", "rejected"].includes(sp.status ?? "") ? sp.status : "pending") as ReviewStatus;

  const [reviews, stats] = await Promise.all([
    listReviews(tenantId, session.userId, status),
    getReviewStats(tenantId, session.userId),
  ]);

  const { locale, d } = await getDict();
  const t = d.admin.reviews;

  return (
    <div className="space-y-4">
      <PageHeader title={t.title} subtitle={`${formatNumber(stats.pending, locale)} ${t.pendingSuffix}`} />

      <StatStrip>
        <StatCard label={t.stat.pending} value={formatNumber(stats.pending, locale)} tone={stats.pending > 0 ? "pending" : "muted"} />
        <StatCard label={t.stat.approved} value={formatNumber(stats.approved, locale)} tone="success" />
        <StatCard label={t.stat.avgRating} value={stats.avgRating > 0 ? stats.avgRating.toFixed(2) : "—"} />
        <StatCard label={t.stat.total} value={formatNumber(stats.pending + stats.approved, locale)} />
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
              {t.status[s.value]}
            </a>
          );
        })}
      </div>

      {reviews.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-ink-muted">
          {t.empty}
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
