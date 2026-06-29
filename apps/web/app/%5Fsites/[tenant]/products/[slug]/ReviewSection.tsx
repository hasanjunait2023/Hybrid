"use client";
import { useState } from "react";
import type { PublicReview } from "@/lib/admin/reviews";
import { submitReviewAction } from "./reviewActions";

function Stars({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${value} তারা`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < value ? "text-accent" : "text-ink-subtle"}>
          ★
        </span>
      ))}
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <span className="inline-flex gap-1" role="group" aria-label="রেটিং দিন">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          aria-label={`${i} তারা`}
          className={`text-2xl leading-none transition-colors ${
            i <= (hover || value) ? "text-accent" : "text-ink-subtle"
          }`}
        >
          ★
        </button>
      ))}
    </span>
  );
}

interface Props {
  tenantSlug: string;
  productId: string;
  initialReviews: PublicReview[];
  avgRating: number;
  reviewCount: number;
}

export function ReviewSection({
  tenantSlug,
  productId,
  initialReviews,
  avgRating,
  reviewCount,
}: Props) {
  const [reviews, setReviews] = useState(initialReviews);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || rating < 1) return;
    setSubmitting(true);
    setError(null);
    const res = await submitReviewAction({ tenantSlug, productId, customerName: name.trim(), rating, body: body.trim() || undefined });
    setSubmitting(false);
    if (!res.ok) { setError(res.error); return; }
    setDone(true);
    setShowForm(false);
    setName(""); setRating(5); setBody("");
  }

  return (
    <section id="reviews" className="mt-8 border-t border-border pt-6">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-base font-bold text-ink">ক্রেতাদের মতামত</h2>
        {reviewCount > 0 && (
          <span className="flex items-center gap-1 text-sm text-ink-muted">
            <Stars value={Math.round(avgRating)} />
            <span className="tnum">{avgRating.toFixed(1)}</span>
            <span>({reviewCount})</span>
          </span>
        )}
      </div>

      {done && (
        <p className="mb-4 rounded-md bg-success-weak px-3 py-2 text-sm text-success">
          ✓ আপনার রিভিউ পাঠানো হয়েছে। অনুমোদনের পরে প্রকাশিত হবে।
        </p>
      )}

      {reviews.length === 0 && !showForm && (
        <p className="mb-4 text-sm text-ink-muted">এখনো কোনো রিভিউ নেই।</p>
      )}

      {reviews.length > 0 && (
        <ul className="mb-4 space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="mb-1 flex items-center gap-2">
                <Stars value={r.rating} />
                <span className="text-sm font-semibold text-ink">{r.customerName ?? "ক্রেতা"}</span>
              </div>
              {r.body && <p className="text-sm text-ink-muted">{r.body}</p>}
            </li>
          ))}
        </ul>
      )}

      {!showForm && !done && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="text-sm font-medium text-primary hover:underline"
        >
          + রিভিউ লিখুন
        </button>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-ink">আপনার মতামত দিন</p>
          {error && <p className="rounded-md bg-danger-weak px-3 py-2 text-sm text-danger">{error}</p>}

          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-muted">রেটিং</label>
            <StarPicker value={rating} onChange={setRating} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-muted">আপনার নাম</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="নাম লিখুন"
              className="h-10 rounded-md border border-border bg-transparent px-3 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-muted">মন্তব্য (ঐচ্ছিক)</label>
            <textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="পণ্য সম্পর্কে আপনার অভিজ্ঞতা..."
              className="rounded-md border border-border bg-transparent px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting || !name.trim() || rating < 1}
              className="h-10 rounded-md bg-primary px-5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {submitting ? "পাঠানো হচ্ছে…" : "পাঠান"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(null); }}
              className="h-10 rounded-md border border-border px-4 text-sm text-ink-muted hover:bg-surface-2"
            >
              বাতিল
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
