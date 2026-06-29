"use server";

// Storefront product review submission. A buyer submits a rating + comment; it
// lands as 'pending' and only appears on the PDP after the seller approves it in
// /admin/reviews. Rate-limited per IP to blunt spam. Public path (userId=null).
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { createReview } from "@/lib/admin/reviews";
import { getStorefrontProductBySlug, getTenantContextBySlug } from "@/lib/storefront/data";
import { rateLimit, clientIpFrom } from "@/lib/ratelimit";

export interface SubmitReviewResult {
  ok: boolean;
  error?: string;
}

const Schema = z.object({
  tenantSlug: z.string().min(1),
  productSlug: z.string().min(1),
  customerName: z.string().trim().min(1, "নাম দিন।").max(80),
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().max(1000).optional().default(""),
});

const MAX_PER_WINDOW = 5;
const WINDOW_SECONDS = 10 * 60;

export async function submitReview(raw: unknown): Promise<SubmitReviewResult> {
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "তথ্য সঠিক নয়।" };
  }
  const input = parsed.data;

  const ctx = await getTenantContextBySlug(input.tenantSlug);
  if (!ctx) return { ok: false, error: "দোকান খুঁজে পাওয়া যায়নি।" };

  const product = await getStorefrontProductBySlug(ctx.id, input.productSlug);
  if (!product) return { ok: false, error: "পণ্য খুঁজে পাওয়া যায়নি।" };

  const { headers } = await import("next/headers");
  const ip = clientIpFrom(await headers());
  const rl = await rateLimit({
    bucket: "product-review",
    identifier: `ip:${ip}`,
    limit: MAX_PER_WINDOW,
    windowSeconds: WINDOW_SECONDS,
  });
  if (!rl.allowed) {
    return { ok: false, error: "অনেকবার চেষ্টা করা হয়েছে — কিছুক্ষণ পর আবার চেষ্টা করুন।" };
  }

  try {
    await createReview(ctx.id, null, {
      productId: product.id,
      customerName: input.customerName,
      rating: input.rating,
      body: input.body || undefined,
    });
  } catch (err) {
    console.error("[submitReview] failed", err);
    return { ok: false, error: "রিভিউ জমা দেওয়া যায়নি। আবার চেষ্টা করুন।" };
  }

  // Pending until moderated, so the public list does not change yet; still bust
  // the tag so the seller's admin queue + any cached aggregate refresh.
  revalidateTag(`tenant:${ctx.id}:reviews`);
  return { ok: true };
}
