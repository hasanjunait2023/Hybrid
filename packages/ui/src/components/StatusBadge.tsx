// StatusBadge — the single source for order/payment/COD/method status chips
// (DESIGN §P0.1). One component, four `kind`s, each reading the enum→token map
// below. Always color + icon + text (§7.4), never color alone.
//
// Three independent DB fields drive three independent chips — never collapse
// them into one badge. Every list, detail, dashboard, and the stepper consume
// this. Class strings are written out in FULL (no string interpolation) so the
// Tailwind JIT scanner keeps the st-* / bkash utilities.
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import {
  ClockIcon,
  CheckIcon,
  BoxIcon,
  TruckIcon,
  CheckCircleIcon,
  UndoIcon,
  XCircleIcon,
  BkashIcon,
} from "./icons";

export type StatusKind = "fulfillment" | "payment" | "cod" | "method";

interface StatusBadgeProps {
  kind: StatusKind;
  value: string;
  /** "en" (system default) or "bn" — pass the active locale from getDict/useDict. */
  lang?: "bn" | "en";
  className?: string;
}

interface Token {
  /** weak bg + DEFAULT text Tailwind classes (full strings for JIT). */
  cls: string;
  bn: string;
  en: string;
  Icon: (props: { className?: string }) => ReactNode;
}

// order_fulfillment_status → token (DESIGN §P0.1). Drives the lifecycle stepper.
const FULFILLMENT: Record<string, Token> = {
  pending: { cls: "bg-st-pending-weak text-st-pending", bn: "অপেক্ষমাণ", en: "Pending", Icon: ClockIcon },
  confirmed: { cls: "bg-st-confirmed-weak text-st-confirmed", bn: "নিশ্চিত", en: "Confirmed", Icon: CheckIcon },
  packed: { cls: "bg-st-packed-weak text-st-packed", bn: "প্যাকড", en: "Packed", Icon: BoxIcon },
  shipped: { cls: "bg-st-shipped-weak text-st-shipped", bn: "পাঠানো হয়েছে", en: "Shipped", Icon: TruckIcon },
  in_transit: { cls: "bg-st-shipped-weak text-st-shipped", bn: "পথে আছে", en: "In transit", Icon: TruckIcon },
  delivered: { cls: "bg-st-delivered-weak text-st-delivered", bn: "ডেলিভার্ড", en: "Delivered", Icon: CheckCircleIcon },
  returned: { cls: "bg-st-returned-weak text-st-returned", bn: "ফেরত", en: "Returned", Icon: UndoIcon },
  cancelled: { cls: "bg-st-cancelled-weak text-st-cancelled", bn: "বাতিল", en: "Cancelled", Icon: XCircleIcon },
};

// payment_status → token. Covers both the order-level order_payment_status enum
// (unpaid/partially_paid/paid/refunded/partially_refunded) and the payment-row
// payment_status enum (pending/success/failed/cancelled/refunded), so one chip
// reads either source.
const PAYMENT: Record<string, Token> = {
  unpaid: { cls: "bg-st-pending-weak text-st-pending", bn: "বকেয়া", en: "Unpaid", Icon: ClockIcon },
  pending: { cls: "bg-st-pending-weak text-st-pending", bn: "প্রসেসিং", en: "Processing", Icon: ClockIcon },
  partially_paid: { cls: "bg-st-pending-weak text-st-pending", bn: "আংশিক", en: "Partial", Icon: ClockIcon },
  paid: { cls: "bg-st-delivered-weak text-st-delivered", bn: "পরিশোধিত", en: "Paid", Icon: CheckCircleIcon },
  success: { cls: "bg-st-delivered-weak text-st-delivered", bn: "পরিশোধিত", en: "Paid", Icon: CheckCircleIcon },
  failed: { cls: "bg-st-cancelled-weak text-st-cancelled", bn: "ব্যর্থ", en: "Failed", Icon: XCircleIcon },
  cancelled: { cls: "bg-st-cancelled-weak text-st-cancelled", bn: "বাতিল", en: "Cancelled", Icon: XCircleIcon },
  refunded: { cls: "bg-st-returned-weak text-st-returned", bn: "রিফান্ড", en: "Refunded", Icon: UndoIcon },
  partially_refunded: { cls: "bg-st-returned-weak text-st-returned", bn: "আংশিক রিফান্ড", en: "Part. refund", Icon: UndoIcon },
};

// cod_status → token. Uses the dedicated COD-green for collected/remitted.
const COD: Record<string, Token> = {
  pending: { cls: "bg-st-pending-weak text-st-pending", bn: "সংগ্রহ বাকি", en: "To collect", Icon: ClockIcon },
  collected: { cls: "bg-cod-weak text-cod", bn: "সংগৃহীত", en: "Collected", Icon: CheckIcon },
  remitted: { cls: "bg-cod-weak text-cod", bn: "জমা হয়েছে", en: "Remitted", Icon: CheckCircleIcon },
  reconciled: { cls: "bg-cod-weak text-cod", bn: "মিলেছে", en: "Reconciled", Icon: CheckCircleIcon },
  discrepancy: { cls: "bg-st-cancelled-weak text-st-cancelled", bn: "গরমিল", en: "Mismatch", Icon: XCircleIcon },
};

// Payment-method chip — which rail. COD = green pill; bKash = the only place
// pink appears in admin.
const METHOD: Record<string, Token> = {
  cod: { cls: "bg-cod-weak text-cod", bn: "ক্যাশ অন ডেলিভারি", en: "Cash on Delivery", Icon: TruckIcon },
  bkash: { cls: "bg-bkash-weak text-bkash-text", bn: "বিকাশ", en: "bKash", Icon: BkashIcon },
  nagad: { cls: "bg-st-pending-weak text-st-pending", bn: "নগদ", en: "Nagad", Icon: BkashIcon },
  manual: { cls: "bg-surface-2 text-ink-muted", bn: "ম্যানুয়াল", en: "Manual", Icon: CheckIcon },
};

const MAPS: Record<StatusKind, Record<string, Token>> = {
  fulfillment: FULFILLMENT,
  payment: PAYMENT,
  cod: COD,
  method: METHOD,
};

export function StatusBadge({ kind, value, lang = "en", className }: StatusBadgeProps) {
  const token = MAPS[kind][value];
  if (!token) {
    // Unknown enum value — render a neutral chip with the raw value rather than
    // crash. Surfaces a data issue without breaking the page.
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-semibold leading-none text-ink-muted", className)}>
        {value}
      </span>
    );
  }
  const { Icon } = token;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold leading-none",
        token.cls,
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {lang === "bn" ? token.bn : token.en}
    </span>
  );
}
