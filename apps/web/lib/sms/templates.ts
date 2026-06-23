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
  paymentMethod: "cod" | "bkash";
  /** Customer name (for the seller alert). */
  customerName: string;
  /** Customer phone (for the seller alert). */
  customerPhone: string;
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
  const method = data.paymentMethod === "cod" ? "ক্যাশ অন ডেলিভারি" : "বিকাশ";
  return `নতুন অর্ডার #${toBnDigits(data.orderNumber)} — ${data.customerName} (${data.customerPhone}), ${bnTaka(data.total)}, ${method}। অর্ডারটি কনফার্ম করুন।`;
}
