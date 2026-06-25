"use server";

// Review moderation Server Actions (P3-1). Auth + RLS via the reviews data
// layer; revalidate the reviews list + the product (storefront rating changes).
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { moderateReview } from "@/lib/admin/reviews";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";

export interface ReviewActionResult {
  ok: boolean;
  error?: string;
}

const Input = z.object({
  reviewId: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
});

export async function moderateReviewAction(reviewId: string, status: string): Promise<ReviewActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };

  const parsed = Input.safeParse({ reviewId, status });
  if (!parsed.success) return { ok: false, error: "অবৈধ অনুরোধ।" };

  await moderateReview(tenantId, session.userId, parsed.data.reviewId, parsed.data.status);
  revalidateTag(`tenant:${tenantId}:reviews`);
  revalidateTag(`tenant:${tenantId}:products`);
  return { ok: true };
}
