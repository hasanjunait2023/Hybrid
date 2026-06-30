"use server";
import { z } from "zod";
import { headers } from "next/headers";
import { getTenantContextBySlug } from "@/lib/storefront/data";
import { submitStorefrontReview } from "@/lib/admin/reviews";
import { rateLimit, clientIpFrom } from "@/lib/ratelimit";

const reviewSchema = z.object({
  tenantSlug: z.string().min(1),
  productId: z.string().uuid(),
  customerName: z.string().min(1).max(80).trim(),
  rating: z.number().int().min(1).max(5),
  body: z.string().max(1000).trim().optional(),
});

export type SubmitReviewResult = { ok: true } | { ok: false; error: string };

export async function submitReviewAction(
  raw: unknown,
): Promise<SubmitReviewResult> {
  // Rate limit unauthenticated review submission: 5 reviews per IP per hour.
  const ip = clientIpFrom(await headers());
  const rl = await rateLimit({ bucket: "review", identifier: ip, limit: 5, windowSeconds: 3600 });
  if (!rl.allowed) {
    return { ok: false, error: "অনেক বেশি রিভিউ জমা দেওয়া হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।" };
  }

  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "অনুগ্রহ করে সব তথ্য সঠিকভাবে দিন।" };
  const input = parsed.data;

  const ctx = await getTenantContextBySlug(input.tenantSlug);
  if (!ctx) return { ok: false, error: "স্টোর পাওয়া যায়নি।" };

  try {
    await submitStorefrontReview(ctx.id, {
      productId: input.productId,
      customerName: input.customerName,
      rating: input.rating,
      body: input.body || undefined,
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "রিভিউ পাঠানো যায়নি। আবার চেষ্টা করুন।" };
  }
}
