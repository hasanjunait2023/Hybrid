"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitReviewAction } from "./reviewActions";

export function ReviewForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    const r = await submitReviewAction(productId, rating, body);
    setBusy(false);
    if (r.needsLogin) {
      router.push(`/login?next=/`);
      return;
    }
    setMsg({ ok: r.ok, text: r.ok ? "রিভিউ জমা হয়েছে — অনুমোদনের অপেক্ষায়।" : r.error ?? "ত্রুটি" });
    if (r.ok) setBody("");
  };

  return (
    <div className="mt-4 flex max-w-md flex-col gap-2 rounded-md border border-border bg-surface p-3">
      <p className="text-sm font-medium">রিভিউ দিন</p>
      {msg ? (
        <p className={`text-sm ${msg.ok ? "text-cod" : "text-danger"}`}>{msg.text}</p>
      ) : null}
      <select
        aria-label="রেটিং"
        value={rating}
        onChange={(e) => setRating(Number(e.target.value))}
        className="rounded border border-border bg-surface-2 px-2 py-1 text-sm"
      >
        {[5, 4, 3, 2, 1].map((n) => (
          <option key={n} value={n}>
            {"★".repeat(n)}
          </option>
        ))}
      </select>
      <textarea
        placeholder="আপনার মতামত (ঐচ্ছিক)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="rounded border border-border bg-surface-2 px-2 py-1 text-sm"
      />
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="min-h-[44px] rounded-md bg-primary font-medium text-white hover:bg-primary-hover disabled:opacity-50"
      >
        জমা দিন
      </button>
    </div>
  );
}
