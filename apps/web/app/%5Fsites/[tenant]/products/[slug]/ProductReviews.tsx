"use client";

// Storefront product reviews — approved-review list + average rating + a submit
// form. Submitted reviews land 'pending' (seller moderates in /admin/reviews),
// so the list doesn't change until approval; we show a thank-you instead.
import { useState, useTransition } from "react";
import { formatNumber } from "@/lib/i18n/format";
import type { StorefrontProductReviews } from "@/lib/storefront/data";
import { submitReview } from "./reviewActions";

interface Labels {
  title: string;
  countSuffix: string;
  none: string;
  writeTitle: string;
  nameLabel: string;
  ratingLabel: string;
  commentLabel: string;
  submit: string;
  submitting: string;
  thanks: string;
}

interface ProductReviewsProps {
  data: StorefrontProductReviews;
  tenantSlug: string;
  productSlug: string;
  locale: "bn" | "en";
  labels: Labels;
}

function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <span className="inline-flex" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={i <= rounded ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.5}
          className="text-accent"
        >
          <path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 5.9 20.4l1.4-6.8L2.2 9l6.9-.7L12 2z" />
        </svg>
      ))}
    </span>
  );
}

export function ProductReviews({ data, tenantSlug, productSlug, locale, labels }: ProductReviewsProps) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [rating, setRating] = useState(5);

  const onSubmit = (fd: FormData) => {
    setError(null);
    start(async () => {
      const res = await submitReview({
        tenantSlug,
        productSlug,
        customerName: String(fd.get("customerName") ?? ""),
        rating,
        body: String(fd.get("body") ?? ""),
      });
      if (!res.ok) {
        setError(res.error ?? "ব্যর্থ হয়েছে।");
        return;
      }
      setDone(true);
    });
  };

  return (
    <section className="mt-10 border-t border-border pt-6">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="bn-heading text-lg font-bold text-ink">{labels.title}</h2>
        {data.count > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-ink-muted">
            <Stars value={data.average} />
            <span className="tnum">
              {formatNumber(data.average, locale)} · {formatNumber(data.count, locale)}
              {labels.countSuffix}
            </span>
          </span>
        )}
      </div>

      {data.reviews.length === 0 ? (
        <p className="bn-body text-sm text-ink-subtle">{labels.none}</p>
      ) : (
        <ul className="space-y-4">
          {data.reviews.map((r) => (
            <li key={r.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="bn-body text-sm font-semibold text-ink">
                  {r.customerName ?? "ক্রেতা"}
                </span>
                <Stars value={r.rating} size={14} />
              </div>
              {r.body && <p className="bn-body mt-1.5 text-sm text-ink-muted">{r.body}</p>}
            </li>
          ))}
        </ul>
      )}

      {/* Write a review */}
      <div className="mt-6">
        {done ? (
          <p className="rounded-lg bg-cod-weak px-4 py-3 text-sm font-medium text-cod">
            {labels.thanks}
          </p>
        ) : (
          <details className="rounded-lg border border-border bg-surface-2 px-4 py-3">
            <summary className="bn-body cursor-pointer text-sm font-semibold text-ink">
              {labels.writeTitle}
            </summary>
            <form action={onSubmit} className="mt-4 space-y-3">
              <label className="block space-y-1">
                <span className="bn-body text-sm text-ink-muted">{labels.nameLabel}</span>
                <input
                  name="customerName"
                  required
                  maxLength={80}
                  className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm"
                />
              </label>

              <div className="space-y-1">
                <span className="bn-body text-sm text-ink-muted">{labels.ratingLabel}</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setRating(i)}
                      aria-label={`${i}`}
                      className="text-accent"
                    >
                      <svg
                        width={26}
                        height={26}
                        viewBox="0 0 24 24"
                        fill={i <= rating ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 5.9 20.4l1.4-6.8L2.2 9l6.9-.7L12 2z" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>

              <label className="block space-y-1">
                <span className="bn-body text-sm text-ink-muted">{labels.commentLabel}</span>
                <textarea
                  name="body"
                  rows={3}
                  maxLength={1000}
                  className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
                />
              </label>

              {error && <p className="text-sm font-medium text-danger">{error}</p>}

              <button
                type="submit"
                disabled={pending}
                className="h-10 rounded-md bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {pending ? labels.submitting : labels.submit}
              </button>
            </form>
          </details>
        )}
      </div>
    </section>
  );
}
