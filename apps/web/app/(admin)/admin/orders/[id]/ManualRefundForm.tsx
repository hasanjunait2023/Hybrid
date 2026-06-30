"use client";

// Manual refund form (O22, sprint 1). Opens as a modal when the merchant
// clicks "Refund" on a paid order. Posts createManualRefund server action
// and shows inline success/error.
import { useState, useTransition, useRef, useEffect } from "react";
import { Button } from "@hybrid/ui";
import { useDict } from "@/lib/i18n/provider";
import { createManualRefund } from "../actions";

interface ManualRefundFormProps {
  orderId: string;
  /** Remaining balance (grand_total - already_refunded). */
  remainingAmount: number;
  /** Locale (typed as Locale union to match formatMoney signature). */
  locale: "bn" | "en";
  /** Locale-aware formatter for the amount input placeholder. */
  formatAmount: (amount: number, locale: "bn" | "en") => string;
  /** Called after successful refund — parent re-fetches order. */
  onSuccess?: () => void;
}

export function ManualRefundForm({
  orderId,
  remainingAmount,
  locale,
  formatAmount,
  onSuccess,
}: ManualRefundFormProps) {
  const d = useDict();
  const t = d.admin.ordersDetail.refund;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createManualRefund(null, formData);
      if (result.ok) {
        setOpen(false);
        onSuccess?.();
      } else {
        setError(result.error ?? t.errorGeneric);
      }
    });
  }

  return (
    <>
      <Button
        variant="secondary"
        size="md"
        onClick={() => setOpen(true)}
        disabled={remainingAmount <= 0}
        aria-label={t.button}
      >
        {t.button}
      </Button>

      <dialog
        ref={dialogRef}
        className="rounded-lg border border-border bg-surface p-0 shadow-xl backdrop:bg-black/40"
        onClose={() => setOpen(false)}
      >
        <form action={handleSubmit} className="w-[min(92vw,28rem)] space-y-4 p-5">
          <header className="flex items-start justify-between">
            <h2 className="text-lg font-semibold text-ink">{t.title}</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-ink-muted hover:bg-surface-2"
              aria-label={t.close}
            >
              ✕
            </button>
          </header>

          <p className="text-sm text-ink-muted">
            {t.remainingLabel}: <span className="font-mono font-semibold tnum text-ink">
              {formatAmount(remainingAmount, locale)}
            </span>
          </p>

          <input type="hidden" name="orderId" value={orderId} />

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">
              {t.amountLabel}
            </span>
            <input
              type="number"
              name="amount"
              required
              min={1}
              max={remainingAmount}
              step="0.01"
              defaultValue={remainingAmount}
              className="h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-ink"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">
              {t.methodLabel}
            </span>
            <select
              name="method"
              required
              defaultValue="bkash"
              className="h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-ink"
            >
              <option value="bkash">{t.methods.bkash}</option>
              <option value="nagad">{t.methods.nagad}</option>
              <option value="cash">{t.methods.cash}</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">
              {t.payoutLabel}
            </span>
            <input
              type="text"
              name="payoutReference"
              maxLength={120}
              placeholder={t.payoutPlaceholder}
              className="h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-ink"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">
              {t.reasonLabel}
            </span>
            <textarea
              name="reason"
              required
              maxLength={500}
              rows={2}
              placeholder={t.reasonPlaceholder}
              className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-ink"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">
              {t.noteLabel}
            </span>
            <textarea
              name="note"
              maxLength={1000}
              rows={2}
              placeholder={t.notePlaceholder}
              className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-ink"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="restock"
              className="h-4 w-4 rounded border-border-strong"
            />
            <span>{t.restockLabel}</span>
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-danger bg-danger-weak px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-10 rounded-md border border-border-strong px-4 text-sm font-semibold text-ink hover:bg-surface-2"
              disabled={pending}
            >
              {t.cancel}
            </button>
            <Button type="submit" variant="primary" size="md" disabled={pending}>
              {pending ? t.submitting : t.submit}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}