"use client";

// Mark-Resolved action (DESIGN §Q3.2). After the seller settles a discrepancy
// with the courier, this clears the tint — a deliberate manual override behind a
// confirm. The real collected/remitted figures are NOT altered (audit intact).
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { resolveDiscrepancy, type ResolveResult } from "./settlement-actions";

export function ResolveButton({ shipmentId }: { shipmentId: string }) {
  const [state, formAction] = useActionState<ResolveResult | null, FormData>(resolveDiscrepancy, null);

  if (state?.ok) {
    return <span className="text-2xs font-medium text-cod">✓ সমাধান হয়েছে</span>;
  }

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("কুরিয়ারের সাথে মিটমাট হয়েছে — সমাধান চিহ্নিত করবেন?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <SubmitButton />
      {state?.error && (
        <span className="ml-1 text-2xs text-danger" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-border-strong px-2 py-1 text-2xs font-medium text-ink-muted hover:bg-surface-2 disabled:opacity-50"
    >
      {pending ? "…" : "সমাধান হয়েছে"}
    </button>
  );
}
