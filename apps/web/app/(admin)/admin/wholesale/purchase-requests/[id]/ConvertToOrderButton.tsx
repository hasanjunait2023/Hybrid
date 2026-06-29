"use client";

// Convert to Order button — shown when PR status is 'accepted'.
import { useActionState } from "react";
import { convertToOrder } from "../actions";
import { useDict } from "@/lib/i18n/provider";

export function ConvertToOrderButton({ prId }: { prId: string }) {
  const d = useDict();
  const t = d.admin.wholesale.purchaseRequests.detail;
  const [state, formAction, pending] = useActionState(convertToOrder, null);

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-bold text-ink">{t.convertToOrder}</h2>
      <form action={formAction}>
        <input type="hidden" name="prId" value={prId} />
        {state?.error && (
          <p className="mb-2 text-xs text-danger">{state.error}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {pending ? "Converting…" : t.convertToOrder}
        </button>
      </form>
    </section>
  );
}
