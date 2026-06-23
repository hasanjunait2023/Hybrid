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
import { withTenant } from "@hybrid/db";
import { placeOrder, InsufficientStockError } from "@/lib/commerce/placeOrder";
import { getTenantContextBySlug } from "@/lib/storefront/data";
import { getEnabledBkash } from "@/lib/payments/bkash";
import { toJsonRecord } from "@/lib/payments/json";
import { sendOrderNotifications } from "@/lib/sms/notify";

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
  paymentMethod: z.enum(["cod", "bkash"]),
  note: z.string().max(500).optional(),
  items: z.array(itemSchema).min(1).max(50),
  /** Absolute origin of the storefront, for the bKash callbackURL. */
  origin: z.string().url(),
});

export type SubmitCheckoutInput = z.infer<typeof checkoutSchema>;

export type SubmitCheckoutResult =
  | { ok: true; method: "cod"; orderNumber: number }
  | { ok: true; method: "bkash"; bkashURL: string; orderNumber: number }
  | { ok: false; error: string };

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
    });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return { ok: false, error: "দুঃখিত, একটি পণ্যের স্টক শেষ হয়ে গেছে।" };
    }
    if (error instanceof Error && error.message === "EMPTY_ORDER") {
      return { ok: false, error: "আপনার কার্ট খালি।" };
    }
    console.error("[checkout] placeOrder failed:", error);
    return { ok: false, error: "অর্ডার তৈরি করা যায়নি। আবার চেষ্টা করুন।" };
  }

  // placeOrder doesn't surface the grand total in its Wave-0 contract; read it
  // back from the payment row (payment.amount = grand_total, set in placeOrder).
  const total = await readPaymentAmount(ctx.id, placed.paymentId);

  // COD: order is confirmed at commit. Fire SMS (non-blocking) + redirect.
  if (!placed.bkashRequired) {
    await sendOrderNotifications({
      storeName: ctx.store.name,
      orderNumber: placed.orderNumber,
      total,
      paymentMethod: "cod",
      customerName: input.name,
      customerPhone: phone,
      sellerPhone: ctx.store.phone ?? null,
    });
    return { ok: true, method: "cod", orderNumber: placed.orderNumber };
  }

  // bKash: kick off the tokenized create. The payment row exists (status
  // pending, id = merchantInvoiceNumber); we now ask the gateway for a paymentID
  // + bkashURL and record the gateway paymentID on provider_ref so the callback
  // can resolve the payment back from ?paymentID.
  const enabled = await getEnabledBkash(ctx.id);
  if (!enabled) {
    return { ok: false, error: "বিকাশ এই মুহূর্তে উপলব্ধ নয়। ক্যাশ অন ডেলিভারি বেছে নিন।" };
  }

  let created;
  try {
    created = await enabled.provider.createPayment(
      {
        amount: String(total),
        currency: "BDT",
        merchantInvoiceNumber: placed.paymentId,
        payerReference: phone,
        callbackURL: `${input.origin}/api/bkash/callback`,
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
  await withTenant(ctx.id, null, (tx) =>
    tx`
      update payment
         set provider_ref = ${created.paymentId},
             payload = ${tx.json(toJsonRecord({ create: created.raw }))},
             updated_at = now()
       where id = ${placed.paymentId}
    `,
  );

  return {
    ok: true,
    method: "bkash",
    bkashURL: created.redirectUrl,
    orderNumber: placed.orderNumber,
  };
}

// Read payment.amount (= grand_total) back for the SMS/bKash amount. Avoids
// widening placeOrder's Wave-0 return contract just to surface the total.
async function readPaymentAmount(tenantId: string, paymentId: string): Promise<number> {
  const rows = await withTenant(tenantId, null, (tx) =>
    tx<{ amount: string }[]>`select amount from payment where id = ${paymentId} limit 1`,
  );
  return rows[0] ? Number(rows[0].amount) : 0;
}
