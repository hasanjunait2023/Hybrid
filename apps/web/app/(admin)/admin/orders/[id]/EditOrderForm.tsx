"use client";

// Edit-order form (O3, sprint 1). Client modal that lets a merchant tweak
// the quantity + unit_price of any line on a non-shipped order. Posts to
// the submitEditOrder server action and shows inline success/error.
//
// Design follows the same pattern as ManualRefundForm (O22): a <dialog>
// modal with a useTransition submit, friendly Bengali error messages, and
// the form re-renders the order detail on success via the parent's
// onSuccess callback (which calls router.refresh()).
import { useState, useTransition, useRef, useEffect } from "react";
import { Button } from "@hybrid/ui";
import { useDict } from "@/lib/i18n/provider";
import { submitEditOrder } from "../actions";
import type { Locale } from "@/lib/i18n/config";

export interface EditableLine {
  id: string;
  title: string;
  variantTitle: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface EditOrderFormProps {
  orderId: string;
  /** Lines available to edit (typically the full set of order items). */
  lines: EditableLine[];
  /** Locale for amount formatting. */
  locale: Locale;
  /** Locale-aware formatter for the amount input placeholder. */
  formatAmount: (amount: number, locale: Locale) => string;
  /** Called after a successful edit — parent re-fetches order. */
  onSuccess?: () => void;
}

export function EditOrderForm({
  orderId,
  lines,
  locale,
  formatAmount,
  onSuccess,
}: EditOrderFormProps) {
  const d = useDict();
  const t = d.admin.ordersDetail.editOrder;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Local working copy of the lines. We don't commit to a server roundtrip
  // until Save is clicked, so the merchant can iterate freely.
  const [working, setWorking] = useState<Record<string, { qty: number; price: number }>>(
    () =>
      Object.fromEntries(
        lines.map((l) => [
          l.id,
          { qty: l.quantity, price: l.unitPrice },
        ]),
      ),
  );

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  function updateLine(id: string, patch: Partial<{ qty: number; price: number }>) {
    setWorking((prev) => {
      const cur = prev[id] ?? { qty: 1, price: 0 };
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  }

  function diffItems(): Array<{ orderItemId: string; quantity?: number; unitPrice?: number }> {
    const out: Array<{ orderItemId: string; quantity?: number; unitPrice?: number }> = [];
    for (const l of lines) {
      const w = working[l.id];
      if (!w) continue;
      if (w.qty !== l.quantity) out.push({ orderItemId: l.id, quantity: w.qty });
      if (w.price !== l.unitPrice) out.push({ orderItemId: l.id, unitPrice: w.price });
    }
    return out;
  }

  const diff = diffItems();
  const hasChanges = diff.length > 0;

  function handleSubmit(formData: FormData) {
    setError(null);
    if (!hasChanges) {
      setError(t.errorNoChanges);
      return;
    }
    const reason = String(formData.get("reason") ?? "").trim();
    if (!reason) {
      setError(t.reasonRequired);
      return;
    }
    formData.set("items", JSON.stringify(diff));
    startTransition(async () => {
      const result = await submitEditOrder(null, formData);
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
        aria-label={t.button}
      >
        {t.button}
      </Button>

      <dialog
        ref={dialogRef}
        className="rounded-lg border border-border bg-surface p-0 shadow-xl backdrop:bg-black/40"
        onClose={() => setOpen(false)}
      >
        <form action={handleSubmit} className="w-[min(94vw,40rem)] space-y-4 p-5">
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

          <p className="text-sm text-ink-muted">{t.subtitle}</p>

          <input type="hidden" name="orderId" value={orderId} />

          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">{t.colProduct}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t.colQuantity}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t.colPrice}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((l) => {
                  const w = working[l.id] ?? { qty: l.quantity, price: l.unitPrice };
                  const newTotal = Math.round(w.qty * w.price * 100) / 100;
                  return (
                    <tr key={l.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-ink">{l.title}</div>
                        {l.variantTitle && (
                          <div className="text-xs text-ink-muted">{l.variantTitle}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          step={1}
                          value={w.qty}
                          onChange={(e) =>
                            updateLine(l.id, { qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })
                          }
                          className="h-9 w-20 rounded-md border border-border-strong bg-surface px-2 text-right text-sm text-ink tnum"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={w.price}
                          onChange={(e) =>
                            updateLine(l.id, { price: Math.max(0, Number(e.target.value) || 0) })
                          }
                          className="h-9 w-24 rounded-md border border-border-strong bg-surface px-2 text-right text-sm text-ink tnum"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-ink-muted tnum">
                        {formatAmount(newTotal, locale)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

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
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={pending || !hasChanges}
            >
              {pending ? t.submitting : t.submit}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
