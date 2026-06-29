"use server";

import { getBuyerSession } from "@/lib/marketplace/session";
import { submitReview, type SubmitReviewOutcome } from "@/lib/marketplace/reviews";

export interface ReviewSubmitResult {
  ok: boolean;
  error?: string;
  needsLogin?: boolean;
}

export async function submitReviewAction(
  productId: string,
  rating: number,
  body: string,
): Promise<ReviewSubmitResult> {
  const session = await getBuyerSession();
  if (!session) return { ok: false, error: "রিভিউ দিতে লগইন করুন।", needsLogin: true };

  const outcome: SubmitReviewOutcome = await submitReview(
    session.buyerId,
    productId,
    rating,
    body.trim() || null,
  );
  if (outcome === "ok") return { ok: true };
  return {
    ok: false,
    error:
      outcome === "not_purchased"
        ? "শুধু ডেলিভারি হওয়া পণ্যে রিভিউ দেওয়া যায়।"
        : "সঠিক রেটিং দিন।",
  };
}
