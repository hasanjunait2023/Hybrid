"use client";

// One review card with star rating + approve/reject (P3-1). Pending reviews show
// both actions; approved/rejected show the current state with the opposite move.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useDict } from "@/lib/i18n/provider";
import { moderateReviewAction } from "./actions";

interface Review {
  id: string;
  productTitle: string | null;
  customerName: string | null;
  rating: number;
  body: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

function Stars({ n }: { n: number }) {
  return (
    <span className="text-accent" aria-label={`${n} star`}>
      {"★".repeat(n)}
      <span className="text-border-strong">{"★".repeat(5 - n)}</span>
    </span>
  );
}

export function ReviewRow({ review }: { review: Review }) {
  const d = useDict();
  const t = d.admin.reviews;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const moderate = (status: "approved" | "rejected") => {
    setError(null);
    startTransition(async () => {
      const res = await moderateReviewAction(review.id, status);
      if (!res.ok) setError(res.error ?? d.common.action.failed);
      else router.refresh();
    });
  };

  return (
    <li className="rounded-lg border border-border bg-surface p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Stars n={review.rating} />
            <span className="truncate text-sm font-semibold text-ink">{review.productTitle ?? "—"}</span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">{review.customerName ?? t.customerFallback}</p>
        </div>
        {review.status !== "pending" && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${
              review.status === "approved" ? "bg-success-weak text-success" : "bg-danger-weak text-danger"
            }`}
          >
            {review.status === "approved" ? t.status.approved : t.status.rejected}
          </span>
        )}
      </div>

      {review.body && <p className="mt-2 text-sm text-ink">{review.body}</p>}
      {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}

      <div className="mt-3 flex gap-2">
        {review.status !== "approved" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => moderate("approved")}
            className="rounded-md bg-success px-3 py-1.5 text-xs font-semibold text-ink-on-primary hover:opacity-90 disabled:opacity-50"
          >
            {t.action.approve}
          </button>
        )}
        {review.status !== "rejected" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => moderate("rejected")}
            className="rounded-md border border-border-strong px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-weak disabled:opacity-50"
          >
            {t.action.reject}
          </button>
        )}
      </div>
    </li>
  );
}
