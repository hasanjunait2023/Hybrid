"use client";

// Return status actions + refund form (detail page). The status form advances
// the return through its lifecycle via updateReturnStatusAction; the refund form
// posts amount + method to refundReturnAction. Thin client wrappers only — the
// server actions own validation. useTransition keeps the buttons responsive.
import { useState, useTransition } from "react";
import { Button } from "@hybrid/ui";
import type { ReturnStatus, RefundMethod } from "@/lib/admin/returns";
import { updateReturnStatusAction, refundReturnAction } from "../actions";

interface StatusStep {
  to: ReturnStatus;
  bn: string;
}

// Next forward step(s) per status. Rejected/cancelled/completed are terminal.
const NEXT_STEP: Partial<Record<ReturnStatus, StatusStep>> = {
  requested: { to: "approved", bn: "অনুমোদন করুন" },
  approved: { to: "in_transit", bn: "পথে পাঠান" },
  in_transit: { to: "received", bn: "গৃহীত চিহ্নিত করুন" },
  received: { to: "completed", bn: "সম্পন্ন করুন" },
  refunded: { to: "completed", bn: "সম্পন্ন করুন" },
};

const REFUND_METHODS: { value: RefundMethod; bn: string }[] = [
  { value: "bkash", bn: "বিকাশ" },
  { value: "nagad", bn: "নগদ (Nagad)" },
  { value: "cash", bn: "ক্যাশ" },
  { value: "none", bn: "রিফান্ড নয়" },
];

interface Props {
  returnId: string;
  status: ReturnStatus;
  defaultRefundAmount: number;
}

export function ReturnActions({ returnId, status, defaultRefundAmount }: Props) {
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
            {pending ? "অপেক্ষা করুন…" : next.bn}
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
            প্রত্যাখ্যান
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
            বাতিল
          </Button>
        )}
      </div>

      {/* Refund form */}
      {canRefund && (
        <form action={refund} className="space-y-2 border-t border-border pt-4">
          <h3 className="text-sm font-bold text-ink">রিফান্ড</h3>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">
                পরিমাণ
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
                মাধ্যম
              </span>
              <select
                name="method"
                value={method}
                onChange={(e) => setMethod(e.target.value as RefundMethod)}
                className="h-11 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
              >
                {REFUND_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.bn}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={pending}>
              {pending ? "অপেক্ষা করুন…" : "রিফান্ড করুন"}
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
