"use server";
// Storefront checkout Server Action (blueprint S-CHECKOUT; DESIGN P1).
//
// Flow:
//   1. Validate input (Zod) at the trust boundary — never trust the client cart
//      prices; placeOrder re-prices from the DB.
//   2. placeOrder(source:'storefront') — the idempotent withTenant transaction
//      (customer/address/atomic-decrement/order/items/payment).
//   3. COD → fire post-commit SMS (customer confirm + seller alert, non-blocking)
//      and return { ok, orderNumber } for the client to redirect to /order/N.
//      bKash → createPayment (merchantInvoiceNumber=paymentId,
//      callbackURL=/api/bkash/callback), store the gateway paymentID on
//      payment.provider_ref so the callback can resolve it back, and return
//      { ok, bkashURL } for the client to open the popup.
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
import { getEnabledBkash } from "@/lib/payments/bkash";
import { getEnabledHybridpay } from "@/lib/payments/hybridpay";
import { toJsonRecord } from "@/lib/payments/json";
import { sendOrderNotifications } from "@/lib/sms/notify";
import { rateLimit, clientIpFrom } from "@/lib/ratelimit";

const itemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
});

const checkoutSchema = z.object({
  tenantSlug: z.string().min(1),
  phone: z.string().min(6).max(20),
  name: z.string().min(1).max(120),
  division: z.string().min(1).max(60),
  district: z.string().min(1).max(60),
  thana: z.string().min(1).max(60),
  addressLine: z.string().min(1).max(300),
  // Hybrid Pay is the single online gateway shown on the storefront (it subsumes
  // bKash/Nagad). 'bkash' stays accepted as a still-functional legacy method.
  paymentMethod: z.enum(["cod", "bkash", "hybridpay"]),
  note: z.string().max(500).optional(),
  // Optional promo code (Phase 2.4). The client sends ONLY the code; placeOrder
  // re-validates and computes the amount server-side under a row lock.
  discountCode: z.string().trim().max(40).optional(),
  items: z.array(itemSchema).min(1).max(50),
  // NOTE: the bKash callbackURL is derived SERVER-SIDE from the tenant's
  // verified primary domain + request scheme — never from a client-supplied
  // origin (open-redirect / phishing aid). Any `origin` the client sends is
  // ignored; the schema accepts unknown extra keys by default.
});

// Per-IP / per-phone abuse dampener thresholds for checkout submission. Fails
// open if Redis is down (see lib/ratelimit.ts).
const CHECKOUT_MAX_PER_WINDOW = 10;
const CHECKOUT_WINDOW_SECONDS = 10 * 60; // 10 minutes

export type SubmitCheckoutInput = z.infer<typeof checkoutSchema>;

/** Discount applied to the placed order, surfaced to the client for the receipt. */
export interface SubmitCheckoutDiscount {
  code: string;
  amount: number;
}

export type SubmitCheckoutResult =
  | { ok: true; method: "cod"; orderNumber: number; discount: SubmitCheckoutDiscount | null }
  | {
      ok: true;
      method: "bkash";
      bkashURL: string;
      orderNumber: number;
      discount: SubmitCheckoutDiscount | null;
    }
  | {
      ok: true;
      method: "hybridpay";
      // The Hybrid Pay hosted page to redirect the buyer to (pp_url).
      redirectURL: string;
      orderNumber: number;
      discount: SubmitCheckoutDiscount | null;
    }
  | { ok: false; error: string };

// Map a discount rejection to a friendly Bengali message. The order is NOT
// created when the code is invalid — the buyer fixes/removes it and resubmits.
const DISCOUNT_MESSAGES: Record<DiscountErrorReason, string> = {
  DISCOUNT_INVALID: "প্রোমো কোডটি সঠিক নয় বা মেয়াদ শেষ।",
  DISCOUNT_BELOW_MINIMUM: "এই কোড ব্যবহারে কার্টের মূল্য যথেষ্ট নয়।",
  DISCOUNT_USAGE_LIMIT: "এই কোড আপনি আগে ব্যবহার করেছেন।",
  DISCOUNT_NOT_APPLICABLE: "এই কোড আপনার কার্টের পণ্যে প্রযোজ্য নয়।",
};

// Normalize a BD phone to Latin digits (DESIGN §4.4 — accept Bangla or Latin).
const BN_TO_LATIN: Record<string, string> = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
};
function normalizePhone(input: string): string {
  return input.replace(/[০-৯]/g, (d) => BN_TO_LATIN[d] ?? d).replace(/[^\d]/g, "");
}

export async function submitCheckout(
  raw: SubmitCheckoutInput,
): Promise<SubmitCheckoutResult> {
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "তথ্য সম্পূর্ণ নয়। সব ঘর পূরণ করুন।" };
  }
  const input = parsed.data;

  const ctx = await getTenantContextBySlug(input.tenantSlug);
  if (!ctx) {
    return { ok: false, error: "দোকান খুঁজে পাওয়া যায়নি।" };
  }

  const phone = normalizePhone(input.phone);

  // Abuse dampener: throttle per client IP AND per normalized phone so a single
  // source can't hammer order creation / SMS. Fails open on a Redis outage.
  const reqHeaders = await requestHeaders();
  const ip = clientIpFrom(reqHeaders);
  for (const identifier of [`ip:${ip}`, `phone:${phone}`]) {
    const rl = await rateLimit({
      bucket: "checkout",
      identifier,
      limit: CHECKOUT_MAX_PER_WINDOW,
      windowSeconds: CHECKOUT_WINDOW_SECONDS,
    });
    if (!rl.allowed) {
      return { ok: false, error: "অনেকবার চেষ্টা করা হয়েছে — কিছুক্ষণ পর আবার চেষ্টা করুন।" };
    }
  }

  // Shipping is computed SERVER-SIDE from the tenant's zone rates + the parcel
  // weight (DB prices/weights, never a client value), then passed to placeOrder
  // so it lands in grand_total + cod_amount. null = shipping not configured → 0.
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
      paymentMethod: input.paymentMethod,
      note: input.note ?? null,
      source: "storefront",
      discountCode: input.discountCode ?? null,
      shippingTotal: shipQuote.amount ?? 0,
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
    if (error instanceof Error && error.message === "ORDER_LIMIT_REACHED") {
      return { ok: false, error: "এই মাসে অর্ডার সীমা পূর্ণ হয়েছে। দোকানটি আবার খুলবে পরের মাসে।" };
    }
    console.error("[checkout] placeOrder failed:", error);
    return { ok: false, error: "অর্ডার তৈরি করা যায়নি। আবার চেষ্টা করুন।" };
  }

  // placeOrder doesn't surface the grand total in its Wave-0 contract; read it
  // back from the payment row (payment.amount = grand_total, set in placeOrder).
  const total = await readPaymentAmount(ctx.id, placed.paymentId);

  // COD: order is confirmed at commit. Fire SMS (non-blocking) + redirect.
  if (!placed.onlineRequired) {
    await sendOrderNotifications({
      tenantId: ctx.id,
      storeName: ctx.store.name,
      orderNumber: placed.orderNumber,
      total,
      paymentMethod: "cod",
      customerName: input.name,
      customerPhone: phone,
      sellerPhone: ctx.store.phone ?? null,
    });
    return {
      ok: true,
      method: "cod",
      orderNumber: placed.orderNumber,
      discount: placed.discount,
    };
  }

  // Hybrid Pay: kick off the create-charge. The payment row exists (status
  // pending, id = merchantInvoiceNumber); we ask Hybrid Pay for a pp_id + pp_url,
  // record the pp_id on provider_ref so the webhook can resolve the payment back,
  // and redirect the buyer to the hosted page (where they pick bKash/Nagad/etc).
  if (input.paymentMethod === "hybridpay") {
    const hp = await getEnabledHybridpay(ctx.id);
    if (!hp) {
      return { ok: false, error: "Hybrid Pay এই মুহূর্তে উপলব্ধ নয়। ক্যাশ অন ডেলিভারি বেছে নিন।" };
    }

    // Callback origin derived SERVER-SIDE from the tenant's verified domain (never
    // a client value) — same open-redirect guard as the bKash path below.
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
      console.error("[checkout] Hybrid Pay createPayment failed:", error);
      return { ok: false, error: "Hybrid Pay পেমেন্ট শুরু করা যায়নি। আবার চেষ্টা করুন।" };
    }

    if (!hpCreated.paymentId || !hpCreated.redirectUrl) {
      return { ok: false, error: "Hybrid Pay পেমেন্ট শুরু করা যায়নি। আবার চেষ্টা করুন।" };
    }

    // Bind the gateway pp_id → our payment row for the webhook lookup. MERGE into
    // the existing jsonb (||) to preserve payload.analytics.eventId.
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

  // bKash (legacy): kick off the tokenized create. The payment row exists (status
  // pending, id = merchantInvoiceNumber); we now ask the gateway for a paymentID
  // + bkashURL and record the gateway paymentID on provider_ref so the callback
  // can resolve the payment back from ?paymentID.
  const enabled = await getEnabledBkash(ctx.id);
  if (!enabled) {
    return { ok: false, error: "বিকাশ এই মুহূর্তে উপলব্ধ নয়। ক্যাশ অন ডেলিভারি বেছে নিন।" };
  }

  // Derive the bKash callback origin SERVER-SIDE from the tenant's verified
  // primary domain + the request scheme — NOT from any client-supplied origin
  // (that would be an open-redirect / phishing aid: bKash would POST the payment
  // result to an attacker-chosen host). If the tenant has no verified domain we
  // refuse rather than fall back to an untrusted value.
  const callbackOrigin = await resolveCallbackOrigin(ctx.id, reqHeaders);
  if (!callbackOrigin) {
    return { ok: false, error: "বিকাশ পেমেন্ট শুরু করা যায়নি। আবার চেষ্টা করুন।" };
  }

  let created;
  try {
    created = await enabled.provider.createPayment(
      {
        amount: String(total),
        currency: "BDT",
        merchantInvoiceNumber: placed.paymentId,
        payerReference: phone,
        callbackURL: `${callbackOrigin}/api/bkash/callback`,
      },
      enabled.creds,
    );
  } catch (error) {
    console.error("[checkout] bKash createPayment failed:", error);
    return { ok: false, error: "বিকাশ পেমেন্ট শুরু করা যায়নি। আবার চেষ্টা করুন।" };
  }

  if (!created.paymentId || !created.redirectUrl) {
    return { ok: false, error: "বিকাশ পেমেন্ট শুরু করা যায়নি। আবার চেষ্টা করুন।" };
  }

  // Bind the gateway paymentID → our payment row for the callback lookup.
  // MERGE into the existing jsonb (||) — placeOrder seeded payload.analytics.eventId
  // (the shared purchase-event dedup key the success page reads); clobbering the
  // whole payload here would drop it and silently kill the bKash purchase analytics.
  await withTenant(ctx.id, null, (tx) =>
    tx`
      update payment
         set provider_ref = ${created.paymentId},
             payload = coalesce(payload, '{}'::jsonb) || ${tx.json(toJsonRecord({ create: created.raw }))},
             updated_at = now()
       where id = ${placed.paymentId}
    `,
  );

  return {
    ok: true,
    method: "bkash",
    bkashURL: created.redirectUrl,
    orderNumber: placed.orderNumber,
    discount: placed.discount,
  };
}

// Live shipping quote for the checkout UI — called when the buyer has picked a
// destination so the shipping line + total update before they submit. Amount is
// authoritative (DB rates/weights); the same calc runs again in submitCheckout,
// so a tampered client value is never trusted.
const quoteSchema = z.object({
  tenantSlug: z.string().min(1),
  division: z.string().min(1).max(60),
  district: z.string().min(1).max(60),
  items: z.array(itemSchema).min(1).max(50),
});

export async function quoteShipping(
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

// Build the trusted callback origin for this tenant: its verified primary
// (subdomain) domain + the request scheme. The domain comes from the DB (the
// same verified tenant_domain rows resolve.ts routes on), never from the client.
// The scheme is taken from the forwarded proto (https behind Vercel/proxies),
// defaulting to https in production. Returns null when no verified domain exists.
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

  // Preserve a non-default port (dev runs on :3000) ONLY when the request host's
  // hostname matches our verified domain — i.e. we copy the port, never the host,
  // from the request. A mismatched/forged host contributes nothing.
  const reqHost = headers.get("host") ?? "";
  const reqHostname = reqHost.split(":")[0];
  const reqPort = reqHost.includes(":") ? `:${reqHost.split(":")[1]}` : "";
  const port = reqHostname === domain ? reqPort : "";
  return `${scheme}://${domain}${port}`;
}

// The incoming request headers (client IP + forwarded proto/scheme). In a real
// Server Action a request scope always exists; outside one (e.g. the integration
// suite that calls submitCheckout directly) headers() throws — we degrade to an
// empty Headers so the limiter buckets under "unknown" and the callback origin
// falls back to the verified domain + default scheme, rather than crashing.
async function requestHeaders(): Promise<Headers> {
  try {
    const { headers } = await import("next/headers");
    return await headers();
  } catch {
    return new Headers();
  }
}

// Read payment.amount (= grand_total) back for the SMS/bKash amount. Avoids
// widening placeOrder's Wave-0 return contract just to surface the total.
async function readPaymentAmount(tenantId: string, paymentId: string): Promise<number> {
  const rows = await withTenant(tenantId, null, (tx) =>
    tx<{ amount: string }[]>`select amount from payment where id = ${paymentId} limit 1`,
  );
  return rows[0] ? Number(rows[0].amount) : 0;
}
