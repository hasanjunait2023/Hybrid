// Bengali SMS templates (blueprint Notifications 1.9, DESIGN Bengali-first).
// Two messages fire after an order commits:
//   * customer order-confirmation — reassurance + the order number to read back.
//   * seller new-order alert — so the F-commerce seller knows to call/confirm.
//
// Amounts are rendered in Bangla numerals (buyer-facing surface, DESIGN §4.4);
// the order number stays alphanumeric/Latin-readable (it's an ID the buyer reads
// back to the seller — DESIGN P1.7). toBnDigits is the shared formatter.
import { toBnDigits } from "@hybrid/ui";

export interface OrderNotificationData {
  /** Display store name (Bangla or Latin as stored). */
  storeName: string;
  /** Per-tenant sequential order number. */
  orderNumber: number;
  /** Grand total in taka (Latin number from the DB). */
  total: number;
  /** Payment rail — drives the COD vs paid copy. */
  paymentMethod: "cod" | "bkash" | "hybridpay";
  /** Customer name (for the seller alert). */
  customerName: string;
  /** Customer phone (for the seller alert). */
  customerPhone: string;
  /**
   * Tenant id, used ONLY to fire the additive, per-tenant comm log row
   * (H1 sms_log/email_log). Optional so existing callers stay valid;
   * absent → the SMS is sent but no log row is written.
   */
  tenantId?: string;
}

function bnTaka(amount: number): string {
  return `৳${toBnDigits(amount)}`;
}

// Customer confirmation. COD spells out pay-on-delivery; bKash confirms payment.
export function customerOrderConfirmationSms(data: OrderNotificationData): string {
  const orderLine = `${data.storeName} — আপনার অর্ডার #${toBnDigits(data.orderNumber)} কনফার্ম হয়েছে।`;
  const amountLine =
    data.paymentMethod === "cod"
      ? `সর্বমোট ${bnTaka(data.total)} ডেলিভারিতে পরিশোধ করুন।`
      : `${bnTaka(data.total)} পেমেন্ট সম্পন্ন হয়েছে।`;
  return `${orderLine} ${amountLine} আমরা শীঘ্রই কল করে কনফার্ম করব। ধন্যবাদ।`;
}

// Seller alert. Latin-ish operational copy is fine here, but we keep it Bengali
// for consistency; phone stays Latin so the seller can dial it directly.
export function sellerNewOrderAlertSms(data: OrderNotificationData): string {
  const method =
    data.paymentMethod === "cod"
      ? "ক্যাশ অন ডেলিভারি"
      : data.paymentMethod === "hybridpay"
        ? "Hybrid Pay"
        : "বিকাশ";
  return `নতুন অর্ডার #${toBnDigits(data.orderNumber)} — ${data.customerName} (${data.customerPhone}), ${bnTaka(data.total)}, ${method}। অর্ডারটি কনফার্ম করুন।`;
}

// =============================================================================
// Phase 6 — Status-change notifications (buyer-facing)
// =============================================================================
// Sellers in Bangladesh EXPECT their customers to be notified when the order
// status changes — especially "shipped" (tracking code goes here) and
// "delivered". This is the single highest-ROI notification: it cuts "where is
// my order?" phone calls by ~60% in F-commerce.
//
// We model these as thin wrappers around OrderNotificationData + an optional
// courier tracking code. They NEVER include the amount (privacy: status SMS
// can land on shared phones).
// =============================================================================

export type StatusChangeKind = "shipped" | "delivered" | "cancelled";

export interface OrderStatusNotificationData extends OrderNotificationData {
  /** Courier tracking code, included on the "shipped" copy. */
  trackingCode?: string | null;
}

export function customerOrderStatusSms(
  data: OrderStatusNotificationData,
  kind: StatusChangeKind,
): string {
  const orderLine = `#${toBnDigits(data.orderNumber)}`;
  switch (kind) {
    case "shipped":
      return `${data.storeName} — আপনার অর্ডার ${orderLine} পাঠানো হয়েছে। ট্র্যাকিং: ${data.trackingCode ?? "—"}। শীঘ্রই পৌঁছে যাবে।`;
    case "delivered":
      return `${data.storeName} — আপনার অর্ডার ${orderLine} ডেলিভারি সম্পন্ন হয়েছে। ভালো থাকুন।`;
    case "cancelled":
      return `${data.storeName} — আপনার অর্ডার ${orderLine} বাতিল হয়েছে। প্রয়োজনে কল করুন।`;
  }
}

// =============================================================================
// SLA breach alerts (BD Digital Commerce Guidelines 2021) — fire from the
// /api/internal/sla-sweep cron (every 30m). Recipient = the merchant (the
// courier-side breach is something only the merchant can act on, not the
// customer). All copy is in Bengali to match the rest of the SMS surface.
// =============================================================================

export interface MerchantHandoverOverdueInput {
  orderNumber: number;
  customerName: string;
  /** How many hours past the 48h deadline (e.g. 6, 12, 24). */
  hoursOverdue: number;
}

export function merchantHandoverOverdueSms(
  input: MerchantHandoverOverdueInput,
): string {
  return `Hybrid — অর্ডার #${toBnDigits(input.orderNumber)} (${input.customerName}) এর কুরিয়ার হ্যান্ডওভার ${toBnDigits(input.hoursOverdue)} ঘণ্টা দেরি হয়েছে। দয়া করে আজই কুরিয়ারে দিন।`;
}

export interface MerchantDeliveryOverdueInput {
  orderNumber: number;
  customerName: string;
  daysOverdue: number;
  slaZone: "same_city" | "out_city";
}

export function merchantDeliveryOverdueSms(
  input: MerchantDeliveryOverdueInput,
): string {
  const zone = input.slaZone === "same_city" ? "শহরের মধ্যে" : "শহরের বাইরে";
  return `Hybrid — অর্ডার #${toBnDigits(input.orderNumber)} (${input.customerName}) ডেলিভারি ${toBnDigits(input.daysOverdue)} দিন দেরি (${zone} SLA)। কুরিয়ার ট্র্যাক করুন ও গ্রাহককে আপডেট দিন।`;
}

// =============================================================================
// Refund notifications (O22, sprint 1)
// =============================================================================
// Customer-facing message: "we returned your money via [method]."
// Two flavors:
//   * mobile money (bKash / Nagad): "check your bKash, ৳X is incoming"
//   * cash: "we'll give you ৳X back when you next visit / with the next order"
//
// Method labels are kept short and colloquial — the customer shouldn't have
// to think about what "Hybrid Pay refund" means.
// =============================================================================

export interface RefundNotificationData {
  /** Display store name. */
  storeName: string;
  /** Per-tenant sequential order number. */
  orderNumber: number;
  /** Refund amount in taka (Latin number). */
  amount: number;
  /** Refund payout method — drives the Bengali copy. */
  method: "bkash" | "nagad" | "cash";
  /** Optional payout reference (bKash trx id). Shown only for mobile money. */
  payoutReference?: string | null;
}

const methodBn: Record<RefundNotificationData["method"], string> = {
  bkash: "বিকাশ",
  nagad: "নগদ",
  cash: "ক্যাশ",
};

export function customerRefundSms(data: RefundNotificationData): string {
  const base = `${data.storeName} — অর্ডার #${toBnDigits(data.orderNumber)} এর জন্য ${bnTaka(data.amount)} ফেরত দেওয়া হয়েছে`;
  if (data.method === "cash") {
    // Cash refund: customer needs to physically receive the money. Promise a
    // window during which it will be available (next order or pickup).
    return `${base}। পরবর্তী অর্ডারে বা স্টোর থেকে সংগ্রহ করতে পারবেন।`;
  }
  const trx = data.payoutReference ? ` (TrxID: ${data.payoutReference})` : "";
  return `${base} ${methodBn[data.method]} এ পাঠানো হচ্ছে${trx}।`;
}

// =============================================================================
// O20 — Auto-cancel-of-unpaid-orders notifications (sprint 1)
// =============================================================================
// Customer-facing message: "we cancelled your order because payment didn't come
// in within [hours]. Re-order any time." We intentionally keep this gentle
// rather than alarming — most of these are forgetful-but-warm leads who will
// re-order if friction stays low. The store name is included so the customer
// recognises the merchant.
// =============================================================================

export interface AutoCancelCustomerInput {
  /** Display store name. */
  storeName: string;
  /** Per-tenant sequential order number. */
  orderNumber: number;
  /** How many hours the order sat unpaid before the sweep cancelled it. */
  hoursOverdue: number;
}

export function customerOrderAutoCancelledSms(
  input: AutoCancelCustomerInput,
): string {
  return `${input.storeName} — অর্ডার #${toBnDigits(input.orderNumber)} পেমেন্ট না পাওয়ায় ${toBnDigits(input.hoursOverdue)} ঘণ্টা পর বাতিল করা হয়েছে। প্রয়োজনে আবার অর্ডার করতে পারবেন।`;
}

// =============================================================================
// O3 — Edit-order notifications (sprint 1)
// =============================================================================
// Customer-facing message: "we updated your order — your new total is ৳X."
//
// Triggered when the merchant edits an existing order's line items BEFORE it
// ships (qty / unit-price / discount change). This is a separate template
// from customerRefundSms because the message shape is fundamentally
// different:
//   * Refund = "we returned money to you, here's how much, here's how"
//   * Edit  = "your order details changed, please re-confirm the new total"
//
// The merchant doesn't get a separate SMS for this — the audit_log entry is
// the merchant-side record. Only the customer gets a heads-up so they know
// the order they're about to receive is the one they confirmed.
// =============================================================================

export interface OrderEditedCustomerInput {
  /** Display store name. */
  storeName: string;
  /** Per-tenant sequential order number. */
  orderNumber: number;
  /** New grand total in taka (Latin number). */
  newTotal: number;
}

export function customerOrderEditedSms(
  input: OrderEditedCustomerInput,
): string {
  return `${input.storeName} — আপনার অর্ডার #${toBnDigits(input.orderNumber)} আপডেট করা হয়েছে। নতুন সর্বমোট ${bnTaka(input.newTotal)}। কোনো প্রশ্ন থাকলে আমাদের জানান।`;
}

// =============================================================================
// O16 — Cart-recovery (abandoned cart) notifications (sprint 3)
// =============================================================================
// Customer-facing message: "you left items in your cart, here's the link
// to come back and finish ordering." Three messages per cart, one per
// configured delay hour:
//   * 1h  — soft nudge ("we saved your cart")
//   * 24h — medium ("your cart is waiting, stock may be limited")
//   * 72h — last chance ("final reminder before we release the items")
//
// The sweep is in lib/marketing/cartRecovery.ts; this file just renders
// the text. We keep all Bengali copy here so the merchant can audit the
// actual message bodies without grepping the sweep code.
// =============================================================================

export interface CartRecoveryCustomerInput {
  /** Display store name (Bangla or Latin as stored). */
  storeName: string;
  /** Cart subtotal in taka (Latin number from the DB). */
  cartTotal: number;
  /** Number of distinct line items in the cart. */
  itemCount: number;
  /** Absolute recovery URL — the sweep builds this from cart.recovery_token. */
  recoveryUrl: string;
  /** Which of the 3 nudges this is — drives the copy. */
  attempt: 1 | 2 | 3;
}

export function customerCartRecoverySms(
  input: CartRecoveryCustomerInput,
): string {
  const itemPart =
    input.itemCount === 1
      ? "১টি পণ্য"
      : `${toBnDigits(input.itemCount)}টি পণ্য`;
  if (input.attempt === 1) {
    return `${input.storeName} — আপনার কার্টে ${itemPart} (${bnTaka(input.cartTotal)}) রয়েছে। অর্ডার সম্পূর্ণ করুন: ${input.recoveryUrl}`;
  }
  if (input.attempt === 2) {
    return `${input.storeName} — ${itemPart} এখনো কার্টে আছে। স্টক সীমিত হতে পারে। আজই অর্ডার করুন: ${input.recoveryUrl}`;
  }
  return `${input.storeName} — শেষ সুযোগ: ${itemPart} ${bnTaka(input.cartTotal)} কার্টে আছে। আজ রাতের মধ্যে অর্ডার করুন: ${input.recoveryUrl}`;
}

// =============================================================================
// R7 — Merchant low-stock alert (sprint 3)
// =============================================================================
// Merchant-facing message: "X is low on stock — reorder." The sweep
// picks each variant at-or-below its threshold, dedups via
// last_low_stock_alert_at (24h cooldown), and fans out one SMS per
// recipient on the tenant's stock_alert_recipients list. Bengali copy
// here so a merchant can audit the actual message bodies without
// grepping the sweep code.
// =============================================================================

export interface MerchantLowStockInput {
  /** Display store name (Bangla or Latin as stored). */
  storeName: string;
  /** Product title. */
  productTitle: string;
  /** Current inventory_quantity for this variant. */
  currentStock: number;
  /** Effective threshold that triggered the alert. */
  threshold: number;
}

export function merchantLowStockSms(input: MerchantLowStockInput): string {
  return `${input.storeName} — "${input.productTitle}" স্টক কম: ${toBnDigits(input.currentStock)}টি বাকি (থ্রেশহোল্ড ${toBnDigits(input.threshold)})। শীঘ্রই রিস্টক করুন।`;
}

// =============================================================================
// Marketplace buyer notifications (Hybrid Bazar multi-vendor checkout)
// =============================================================================

export interface MarketplaceOrderConfirmationData {
  buyerName: string;
  /** Number of successful vendor sub-orders in this checkout. */
  vendorCount: number;
  /** Grand total across all confirmed vendors (taka). */
  grandTotal: number;
}

export function marketplaceBuyerOrderConfirmationSms(
  data: MarketplaceOrderConfirmationData,
): string {
  const n = toBnDigits(data.vendorCount);
  return `Hybrid Bazar অর্ডার কনফার্ম হয়েছে। ${n}টি বিক্রেতা, সর্বমোট ৳${toBnDigits(data.grandTotal)}। ধন্যবাদ।`;
}
