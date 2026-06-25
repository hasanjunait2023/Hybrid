// Return status chip — local to the returns surface. Mirrors the StatusChip
// pattern in products/page.tsx (bg-st-*-weak / text-st-* tokens) so a return's
// lifecycle reads at a glance. Server component (no client state).
import type { ReturnStatus, ReturnType } from "@/lib/admin/returns";

const STATUS_STYLE: Record<ReturnStatus, { tone: string; label: string }> = {
  requested: { tone: "bg-st-pending-weak text-st-pending", label: "Requested" },
  approved: { tone: "bg-st-confirmed-weak text-st-confirmed", label: "Approved" },
  rejected: { tone: "bg-danger-weak text-danger", label: "Rejected" },
  in_transit: { tone: "bg-st-shipped-weak text-st-shipped", label: "In transit" },
  received: { tone: "bg-st-packed-weak text-st-packed", label: "Received" },
  refunded: { tone: "bg-success-weak text-success", label: "Refunded" },
  completed: { tone: "bg-st-delivered-weak text-st-delivered", label: "Completed" },
  cancelled: { tone: "bg-surface-2 text-ink-muted", label: "Cancelled" },
};

const TYPE_STYLE: Record<ReturnType, { tone: string; label: string }> = {
  return: { tone: "bg-st-returned-weak text-st-returned", label: "Return" },
  exchange: { tone: "bg-st-confirmed-weak text-st-confirmed", label: "Exchange" },
  rto: { tone: "bg-warning-weak text-warning", label: "RTO" },
};

export function ReturnStatusChip({ status }: { status: ReturnStatus }) {
  const s = STATUS_STYLE[status] ?? { tone: "bg-surface-2 text-ink-muted", label: status };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ${s.tone}`}>
      {s.label}
    </span>
  );
}

export function ReturnTypeChip({ type }: { type: ReturnType }) {
  const s = TYPE_STYLE[type] ?? { tone: "bg-surface-2 text-ink-muted", label: type };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ${s.tone}`}>
      {s.label}
    </span>
  );
}
