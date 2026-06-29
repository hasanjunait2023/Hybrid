"use client";

// Quote form — shown when PR status is 'submitted'.
import { useActionState } from "react";
import { submitQuote } from "../actions";
import { useDict } from "@/lib/i18n/provider";

export function QuoteForm({ prId }: { prId: string }) {
  const d = useDict();
  const t = d.admin.wholesale.purchaseRequests.detail;
  const [state, formAction, pending] = useActionState(submitQuote, null);

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-bold text-ink">{t.quoteForm}</h2>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="prId" value={prId} />

        <div>
          <label className="block text-xs font-medium text-ink-muted">{t.quotedSubtotal}</label>
          <input
            type="number"
            name="quotedSubtotal"
            min="0"
            step="0.01"
            required
            className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-muted">{t.quotedTotal}</label>
          <input
            type="number"
            name="quotedTotal"
            min="0"
            step="0.01"
            required
            className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-muted">{t.expiresAt}</label>
          <input
            type="date"
            name="expiresAt"
            required
            className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          />
        </div>

        {state?.error && (
          <p className="text-xs text-danger">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {pending ? "Saving…" : t.submitQuote}
        </button>
      </form>
    </section>
  );
}
