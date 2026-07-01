"use server";

// Marketplace checkout (M4). Requires a buyer session; splits the cart into
// per-vendor COD sub-orders via the orchestrator. Server re-prices everything.
import { z } from "zod";
import { getBuyerSession } from "@/lib/marketplace/session";
import { rateLimit } from "@/lib/ratelimit";
import {
  placeMarketplaceOrder,
  type PlaceMarketplaceOrderResult,
} from "@/lib/marketplace/placeMarketplaceOrder";

const schema = z.object({
  contact: z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(11).max(20),
  }),
  shipTo: z.object({
    division: z.string().trim().min(1).max(60),
    district: z.string().trim().min(1).max(60),
    thana: z.string().trim().min(1).max(60),
    line: z.string().trim().min(1).max(240),
  }),
  lines: z
    .array(
      z.object({
        tenantId: z.string().uuid(),
        variantId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(50),
  idempotencyKey: z.string().min(8).max(64),
});

export type CheckoutResult =
  | { ok: true; result: PlaceMarketplaceOrderResult }
  | { ok: false; error: string; needsLogin?: boolean };

export async function submitMarketplaceCheckout(raw: unknown): Promise<CheckoutResult> {
  const session = await getBuyerSession();
  if (!session) return { ok: false, error: "চেকআউটের আগে লগইন করুন।", needsLogin: true };

  // Throttle order placement per buyer (abuse / accidental double-fire). Fails
  // OPEN on a Redis outage so a real shopper is never blocked — the saga's
  // idempotency key is the second line of defence against duplicates.
  const limit = await rateLimit({
    bucket: "mp-checkout",
    identifier: session.buyerId,
    limit: 10,
    windowSeconds: 60,
  });
  if (!limit.allowed) {
    return { ok: false, error: "অনেকবার চেষ্টা করেছেন। কিছুক্ষণ পর আবার চেষ্টা করুন।" };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "তথ্য সম্পূর্ণ নয়। সব ঘর পূরণ করুন।" };
  const input = parsed.data;

  try {
    const result = await placeMarketplaceOrder({
      buyerId: session.buyerId,
      idempotencyKey: input.idempotencyKey,
      contact: input.contact,
      shipTo: input.shipTo,
      lines: input.lines,
    });
    if (result.status === "failed") {
      return { ok: false, error: "কোনো পণ্য অর্ডার করা যায়নি। স্টক শেষ হতে পারে।" };
    }
    return { ok: true, result };
  } catch (error) {
    console.error("[marketplace-checkout] failed", error);
    return { ok: false, error: "অর্ডার সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।" };
  }
}
