"use client";

// Accept / Reject buttons — shown when PR status is 'quoted'.
import { useActionState } from "react";
import { acceptQuote, rejectQuote } from "../actions";
import { useDict } from "@/lib/i18n/provider";

export function AcceptRejectButtons({ prId }: { prId: string }) {
  const d = useDict();
  const t = d.admin.wholesale.purchaseRequests.detail;
  const [acceptState, acceptAction, acceptPending] = useActionState(acceptQuote, null);
  const [rejectState, rejectAction, rejectPending] = useActionState(rejectQuote, null);

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-bold text-ink">{t.acceptQuote} / {t.rejectQuote}</h2>

      <form action={acceptAction} className="mb-2">
        <input type="hidden" name="prId" value={prId} />
        {acceptState?.error && (
          <p className="mb-2 text-xs text-danger">{acceptState.error}</p>
        )}
        <button
          type="submit"
          disabled={acceptPending}
          className="w-full rounded-md bg-success px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {acceptPending ? "Saving…" : t.acceptQuote}
        </button>
      </form>

      <form action={rejectAction}>
        <input type="hidden" name="prId" value={prId} />
        {rejectState?.error && (
          <p className="mb-2 text-xs text-danger">{rejectState.error}</p>
        )}
        <button
          type="submit"
          disabled={rejectPending}
          className="w-full rounded-md border border-danger px-4 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger hover:text-white disabled:opacity-50"
        >
          {rejectPending ? "Saving…" : t.rejectQuote}
        </button>
      </form>
    </section>
  );
}
