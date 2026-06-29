"use client";

// Inline form for recording payments and credit notes.
import { useActionState } from "react";
import { recordPayment, issueCreditNote } from "./actions";
import { useDict } from "@/lib/i18n/provider";

export function LedgerForm({
  customerId,
  onDone: _onDone,
}: {
  customerId: string;
  onDone?: () => void;
}) {
  const d = useDict();
  const t = d.admin.wholesale.ledger;

  const [payState, payAction, payPending] = useActionState(recordPayment, null);
  const [cnState, cnAction, cnPending] = useActionState(issueCreditNote, null);

  return (
    <div className="space-y-4">
      {/* Record Payment */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="mb-3 text-sm font-bold text-ink">
          {t.types.payment ?? "Record Payment"}
        </h3>
        <form action={payAction} className="space-y-3">
          <input type="hidden" name="customerId" value={customerId} />

          <div>
            <label className="block text-xs font-medium text-ink-muted">
              {t.table.amount} (৳)
            </label>
            <input
              type="number"
              name="amount"
              min="1"
              step="0.01"
              required
              className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted">
              {t.table.reference}
            </label>
            <input
              type="text"
              name="referenceType"
              placeholder="e.g. bKash, Bank, Cash"
              className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted">
              Reference ID
            </label>
            <input
              type="text"
              name="referenceId"
              placeholder="Transaction ID"
              className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted">
              {t.table.note}
            </label>
            <input
              type="text"
              name="note"
              placeholder="Optional note"
              className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
            />
          </div>

          {payState?.error && (
            <p className="text-xs text-danger">{payState.error}</p>
          )}
          {payState?.ok && (
            <p className="text-xs text-success">Payment recorded.</p>
          )}

          <button
            type="submit"
            disabled={payPending}
            className="w-full rounded-md bg-success px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {payPending ? "Saving…" : "Record Payment"}
          </button>
        </form>
      </section>

      {/* Issue Credit Note */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="mb-3 text-sm font-bold text-ink">
          {t.types.credit_note ?? "Issue Credit Note"}
        </h3>
        <form action={cnAction} className="space-y-3">
          <input type="hidden" name="customerId" value={customerId} />

          <div>
            <label className="block text-xs font-medium text-ink-muted">
              {t.table.amount} (৳)
            </label>
            <input
              type="number"
              name="amount"
              min="1"
              step="0.01"
              required
              className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted">
              {t.table.note}
            </label>
            <input
              type="text"
              name="note"
              placeholder="Reason for credit note"
              className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
            />
          </div>

          {cnState?.error && (
            <p className="text-xs text-danger">{cnState.error}</p>
          )}
          {cnState?.ok && (
            <p className="text-xs text-success">Credit note issued.</p>
          )}

          <button
            type="submit"
            disabled={cnPending}
            className="w-full rounded-md bg-warning px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {cnPending ? "Saving…" : "Issue Credit Note"}
          </button>
        </form>
      </section>
    </div>
  );
}
