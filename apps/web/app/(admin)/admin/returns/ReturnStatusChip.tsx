// Return status chip — local to the returns surface. Mirrors the StatusChip
// pattern in products/page.tsx (bg-st-*-weak / text-st-* tokens) so a return's
// lifecycle reads at a glance. Server component (no client state).
import type { ReturnStatus, ReturnType } from "@/lib/admin/returns";
import type { Locale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/dictionaries";

const STATUS_TONE: Record<ReturnStatus, string> = {
  requested: "bg-st-pending-weak text-st-pending",
  approved: "bg-st-confirmed-weak text-st-confirmed",
  rejected: "bg-danger-weak text-danger",
  in_transit: "bg-st-shipped-weak text-st-shipped",
  received: "bg-st-packed-weak text-st-packed",
  refunded: "bg-success-weak text-success",
  completed: "bg-st-delivered-weak text-st-delivered",
  cancelled: "bg-surface-2 text-ink-muted",
};

const TYPE_TONE: Record<ReturnType, string> = {
  return: "bg-st-returned-weak text-st-returned",
  exchange: "bg-st-confirmed-weak text-st-confirmed",
  rto: "bg-warning-weak text-warning",
};

export function ReturnStatusChip({ status, lang }: { status: ReturnStatus; lang: Locale }) {
  const t = getMessages(lang).admin.returns.statusChip;
  const tone = STATUS_TONE[status] ?? "bg-surface-2 text-ink-muted";
  const label = t[status as keyof typeof t] ?? status;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ${tone}`}>
      {label}
    </span>
  );
}

export function ReturnTypeChip({ type, lang }: { type: ReturnType; lang: Locale }) {
  const t = getMessages(lang).admin.returns.typeChip;
  const tone = TYPE_TONE[type] ?? "bg-surface-2 text-ink-muted";
  const label = t[type as keyof typeof t] ?? type;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ${tone}`}>
      {label}
    </span>
  );
}
