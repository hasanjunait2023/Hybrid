"use client";

// Return status actions + refund form (detail page). The status form advances
// the return through its lifecycle via updateReturnStatusAction; the refund form
// posts amount + method to refundReturnAction. Thin client wrappers only — the
// server actions own validation. useTransition keeps the buttons responsive.
import { useState, useTransition } from "react";
import { Button } from "@hybrid/ui";
import type { ReturnStatus, RefundMethod } from "@/lib/admin/returns";
import { useDict } from "@/lib/i18n/provider";
import { updateReturnStatusAction, refundReturnAction } from "../actions";

// Next forward step per status + the dict key for its button label.
// Rejected/cancelled/completed are terminal.
const NEXT_STEP: Partial<Record<ReturnStatus, { to: ReturnStatus; labelKey: "approve" | "sendInTransit" | "markReceived" | "complete" }>> = {
  requested: { to: "approved", labelKey: "approve" },
  approved: { to: "in_transit", labelKey: "sendInTransit" },
  in_transit: { to: "received", labelKey: "markReceived" },
  received: { to: "completed", labelKey: "complete" },
  refunded: { to: "completed", labelKey: "complete" },
};

const REFUND_METHOD_VALUES: RefundMethod[] = ["bkash", "nagad", "cash", "none"];

interface Props {
  returnId: string;
  status: ReturnStatus;
  defaultRefundAmount: number;
}

export function ReturnActions({ returnId, status, defaultRefundAmount }: Props) {
  const t = useDict().admin.returns;
  const next = NEXT_STEP[status];
  const terminal = status === "completed" || status === "cancelled" || status === "rejected";
  const canRefund = status !== "rejected" && status !== "cancelled" && status !== "refunded";

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<RefundMethod>("bkash");

  const advance = (to: ReturnStatus) => {
    setError(null);
    startTransition(async () => {
      const res = await updateReturnStatusAction(returnId, to);
      if (res && "error" in res && res.error) setError(res.error);
    });
  };

  // Refund-method option labels: bkash/cash reuse the shared method dict; nagad
  // and "no refund" use the action-specific variants ("নগদ (Nagad)" / "রিফান্ড নয়").
  const methodLabel = (value: RefundMethod): string => {
    if (value === "nagad") return t.actions.methodNagad;
    if (value === "none") return t.actions.methodNone;
    return t.method[value];
  };

  const refund = (formData: FormData) => {
    setError(null);
    const amount = Number(formData.get("amount"));
    startTransition(async () => {
      const res = await refundReturnAction(returnId, amount, method);
      if (res && "error" in res && res.error) setError(res.error);
    });
  };

  return (
    <div className="space-y-4">
      {/* Forward + reject controls */}
      <div className="flex flex-wrap items-center gap-2">
        {next && (
          <Button type="button" disabled={pending} onClick={() => advance(next.to)}>
            {pending ? t.actions.waiting : t.actions[next.labelKey]}
          </Button>
        )}
        {!terminal && status === "requested" && (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            className="text-danger"
            onClick={() => advance("rejected")}
          >
            {t.actions.reject}
          </Button>
        )}
        {!terminal && (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            className="text-ink-muted"
            onClick={() => advance("cancelled")}
          >
            {t.actions.cancel}
          </Button>
        )}
      </div>

      {/* Refund form */}
      {canRefund && (
        <form action={refund} className="space-y-2 border-t border-border pt-4">
          <h3 className="text-sm font-bold text-ink">{t.actions.refund}</h3>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">
                {t.actions.amount}
              </span>
              <input
                name="amount"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                defaultValue={defaultRefundAmount}
                required
                className="h-11 w-32 rounded-md border border-border-strong bg-surface px-3 font-mono text-sm text-ink tnum focus:border-primary focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">
                {t.actions.method}
              </span>
              <select
                name="method"
                value={method}
                onChange={(e) => setMethod(e.target.value as RefundMethod)}
                className="h-11 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
              >
                {REFUND_METHOD_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {methodLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={pending}>
              {pending ? t.actions.waiting : t.actions.refundDo}
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
