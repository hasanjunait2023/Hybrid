"use server";
// Wholesale checkout Server Action. Creates orders with order_mode='wholesale'.
// Supports purchase request option for credit-based B2B buyers.
import { z } from "zod";
import { withTenant, asPlatformAdmin } from "@hybrid/db";
import {
  placeOrder,
  InsufficientStockError,
  DiscountError,
  type DiscountErrorReason,
} from "@/lib/commerce/placeOrder";
import { getTenantContextBySlug } from "@/lib/storefront/data";
import { calculateShipping } from "@/lib/commerce/shipping";
import { getEnabledHybridpay } from "@/lib/payments/hybridpay";
import { toJsonRecord } from "@/lib/payments/json";
import { sendOrderNotifications } from "@/lib/sms/notify";
import { rateLimit, clientIpFrom } from "@/lib/ratelimit";

const itemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(9999),
});

const wholesaleCheckoutSchema = z.object({
  tenantSlug: z.string().min(1),
  phone: z.string().min(6).max(20),
  name: z.string().min(1).max(120),
  businessName: z.string().max(200).optional(),
  division: z.string().min(1).max(60),
  district: z.string().min(1).max(60),
  thana: z.string().min(1).max(60),
  addressLine: z.string().min(1).max(300),
  paymentMethod: z.enum(["cod", "hybridpay", "credit"]),
  note: z.string().max(500).optional(),
  discountCode: z.string().trim().max(40).optional(),
  items: z.array(itemSchema).min(1).max(200),
  /** When true, submit as a purchase request instead of a direct order. */
  asPurchaseRequest: z.boolean().optional(),
});

const CHECKOUT_MAX_PER_WINDOW = 10;
const CHECKOUT_WINDOW_SECONDS = 10 * 60;

export type SubmitWholesaleCheckoutInput = z.infer<typeof wholesaleCheckoutSchema>;

export interface SubmitWholesaleCheckoutDiscount {
  code: string;
  amount: number;
}

export type SubmitWholesaleCheckoutResult =
  | {
      ok: true;
      method: "cod" | "credit";
      orderNumber: number;
      discount: SubmitWholesaleCheckoutDiscount | null;
    }
  | {
      ok: true;
      method: "hybridpay";
      redirectURL: string;
      orderNumber: number;
      discount: SubmitWholesaleCheckoutDiscount | null;
    }
  | {
      ok: true;
      method: "purchase_request";
      prNumber: number;
    }
  | { ok: false; error: string };

const DISCOUNT_MESSAGES: Record<DiscountErrorReason, string> = {
  DISCOUNT_INVALID: "প্রোমো কোডটি সঠিক নয় বা মেয়াদ শেষ।",
  DISCOUNT_BELOW_MINIMUM: "এই কোড ব্যবহারে কার্টের মূল্য যথেষ্ট নয়।",
  DISCOUNT_USAGE_LIMIT: "এই কোড আপনি আগে ব্যবহার করেছেন।",
  DISCOUNT_NOT_APPLICABLE: "এই কোড আপনার কার্টের পণ্যে প্রযোজ্য নয়।",
};

const BN_TO_LATIN: Record<string, string> = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
};

function normalizePhone(input: string): string {
  return input.replace(/[০-৯]/g, (d) => BN_TO_LATIN[d] ?? d).replace(/[^\d]/g, "");
}

export async function submitWholesaleCheckout(
  raw: SubmitWholesaleCheckoutInput,
): Promise<SubmitWholesaleCheckoutResult> {
  const parsed = wholesaleCheckoutSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "তথ্য সম্পূর্ণ নয়। সব ঘর পূরণ করুন।" };
  }
  const input = parsed.data;

  const ctx = await getTenantContextBySlug(input.tenantSlug);
  if (!ctx) {
    return { ok: false, error: "দোকান খুঁজে পাওয়া যায়নি।" };
  }

  const phone = normalizePhone(input.phone);

  // Rate limit
  const reqHeaders = await requestHeaders();
  const ip = clientIpFrom(reqHeaders);
  for (const identifier of [`ip:${ip}`, `phone:${phone}`]) {
    const rl = await rateLimit({
      bucket: "wholesale-checkout",
      identifier,
      limit: CHECKOUT_MAX_PER_WINDOW,
      windowSeconds: CHECKOUT_WINDOW_SECONDS,
    });
    if (!rl.allowed) {
      return { ok: false, error: "অনেকবার চেষ্টা করা হয়েছে — কিছুক্ষণ পর আবার চেষ্টা করুন।" };
    }
  }

  // Purchase request flow — create a purchase_request instead of an order
  if (input.asPurchaseRequest) {
    try {
      const prNumber = await createPurchaseRequest(ctx.id, {
        buyerPhone: phone,
        buyerName: input.name,
        businessName: input.businessName ?? null,
        items: input.items,
        note: input.note ?? null,
      });
      return {
        ok: true,
        method: "purchase_request",
        prNumber,
      };
    } catch (error) {
      console.error("[wholesale-checkout] purchase request failed:", error);
      return { ok: false, error: "পারচেজ রিকোয়েস্ট তৈরি করা যায়নি। আবার চেষ্টা করুন।" };
    }
  }

  // Direct order flow
  const shipQuote = await calculateShipping(ctx.id, null, {
    items: input.items,
    destDivision: input.division,
    destDistrict: input.district,
  });

  let placed;
  try {
    placed = await placeOrder({
      tenantId: ctx.id,
      userId: null,
      customer: { phone, name: input.name },
      shippingAddress: {
        recipient: input.name,
        phone,
        division: input.division,
        district: input.district,
        thana: input.thana,
        line: input.addressLine,
      },
      items: input.items,
      paymentMethod: input.paymentMethod === "credit" ? "cod" : input.paymentMethod,
      note: input.note ?? null,
      source: "storefront",
      discountCode: input.discountCode ?? null,
      shippingTotal: shipQuote.amount ?? 0,
      orderMode: "wholesale",
    });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return { ok: false, error: "দুঃখিত, একটি পণ্যের স্টক শেষ হয়ে গেছে।" };
    }
    if (error instanceof DiscountError) {
      return { ok: false, error: DISCOUNT_MESSAGES[error.reason] };
    }
    if (error instanceof Error && error.message === "EMPTY_ORDER") {
      return { ok: false, error: "আপনার কার্ট খালি।" };
    }
    console.error("[wholesale-checkout] placeOrder failed:", error);
    return { ok: false, error: "অর্ডার তৈরি করা যায়নি। আবার চেষ্টা করুন।" };
  }

  const total = await readPaymentAmount(ctx.id, placed.paymentId);

  // COD or credit: order confirmed at commit
  if (!placed.onlineRequired) {
    await sendOrderNotifications({
      tenantId: ctx.id,
      storeName: ctx.store.name,
      orderNumber: placed.orderNumber,
      total,
      paymentMethod: input.paymentMethod === "credit" ? "cod" : "cod",
      customerName: input.name,
      customerPhone: phone,
      sellerPhone: ctx.store.phone ?? null,
    });
    return {
      ok: true,
      method: input.paymentMethod === "credit" ? "credit" : "cod",
      orderNumber: placed.orderNumber,
      discount: placed.discount,
    };
  }

  // Hybrid Pay
  if (input.paymentMethod === "hybridpay") {
    const hp = await getEnabledHybridpay(ctx.id);
    if (!hp) {
      return { ok: false, error: "Hybrid Pay এই মুহূর্তে উপলব্ধ নয়। ক্যাশ অন ডেলিভারি বেছে নিন।" };
    }

    const hpOrigin = await resolveCallbackOrigin(ctx.id, reqHeaders);
    if (!hpOrigin) {
      return { ok: false, error: "Hybrid Pay পেমেন্ট শুরু করা যায়নি। আবার চেষ্টা করুন।" };
    }

    let hpCreated;
    try {
      hpCreated = await hp.provider.createPayment(
        {
          amount: String(total),
          currency: "BDT",
          merchantInvoiceNumber: placed.paymentId,
          payerReference: phone,
          callbackURL: `${hpOrigin}/api/hybridpay/webhook`,
        },
        hp.creds,
      );
    } catch (error) {
      console.error("[wholesale-checkout] Hybrid Pay createPayment failed:", error);
      return { ok: false, error: "Hybrid Pay পেমেন্ট শুরু করা যায়নি। আবার চেষ্টা করুন।" };
    }

    if (!hpCreated.paymentId || !hpCreated.redirectUrl) {
      return { ok: false, error: "Hybrid Pay পেমেন্ট শুরু করা যায়নি। আবার চেষ্টা করুন।" };
    }

    await withTenant(ctx.id, null, (tx) =>
      tx`
        update payment
           set provider_ref = ${hpCreated.paymentId},
               payload = coalesce(payload, '{}'::jsonb) || ${tx.json(toJsonRecord({ create: hpCreated.raw }))},
               updated_at = now()
         where id = ${placed.paymentId}
      `,
    );

    return {
      ok: true,
      method: "hybridpay",
      redirectURL: hpCreated.redirectUrl,
      orderNumber: placed.orderNumber,
      discount: placed.discount,
    };
  }

  return { ok: false, error: "পেমেন্ট পদ্ধতি সঠিক নয়।" };
}

// ── Purchase request creation ───────────────────────────────────────────────
async function createPurchaseRequest(
  tenantId: string,
  opts: {
    buyerPhone: string;
    buyerName: string;
    businessName: string | null;
    items: { variantId: string; quantity: number }[];
    note: string | null;
  },
): Promise<number> {
  const rows = await withTenant(tenantId, null, (tx) =>
    tx<{ pr_number: string }[]>`
      insert into purchase_request (
        tenant_id, buyer_phone, buyer_name, business_name,
        items, status, note
      ) values (
        ${tenantId}, ${opts.buyerPhone}, ${opts.buyerName},
        ${opts.businessName},
        ${tx.json(opts.items)},
        'pending',
        ${opts.note}
      )
      returning pr_number
    `,
  );
  return Number(rows[0]?.pr_number ?? 0);
}

// ── Shipping quote ──────────────────────────────────────────────────────────
const quoteSchema = z.object({
  tenantSlug: z.string().min(1),
  division: z.string().min(1).max(60),
  district: z.string().min(1).max(60),
  items: z.array(itemSchema).min(1).max(200),
});

export async function quoteWholesaleShipping(
  raw: z.infer<typeof quoteSchema>,
): Promise<{ amount: number | null }> {
  const parsed = quoteSchema.safeParse(raw);
  if (!parsed.success) return { amount: null };
  const ctx = await getTenantContextBySlug(parsed.data.tenantSlug);
  if (!ctx) return { amount: null };
  const q = await calculateShipping(ctx.id, null, {
    items: parsed.data.items,
    destDivision: parsed.data.division,
    destDistrict: parsed.data.district,
  });
  return { amount: q.amount };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
async function resolveCallbackOrigin(
  tenantId: string,
  headers: Headers,
): Promise<string | null> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ domain: string }[]>`
      select domain
        from tenant_domain
       where tenant_id = ${tenantId} and verified = true
       order by is_primary desc, created_at asc
       limit 1
    `,
  );
  const domain = rows[0]?.domain;
  if (!domain) return null;

  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const scheme =
    proto === "https" || proto === "http"
      ? proto
      : process.env.NODE_ENV === "production"
        ? "https"
        : "http";

  const reqHost = headers.get("host") ?? "";
  const reqHostname = reqHost.split(":")[0];
  const reqPort = reqHost.includes(":") ? `:${reqHost.split(":")[1]}` : "";
  const port = reqHostname === domain ? reqPort : "";
  return `${scheme}://${domain}${port}`;
}

async function requestHeaders(): Promise<Headers> {
  try {
    const { headers } = await import("next/headers");
    return await headers();
  } catch {
    return new Headers();
  }
}

async function readPaymentAmount(tenantId: string, paymentId: string): Promise<number> {
  const rows = await withTenant(tenantId, null, (tx) =>
    tx<{ amount: string }[]>`select amount from payment where id = ${paymentId} limit 1`,
  );
  return rows[0] ? Number(rows[0].amount) : 0;
}
