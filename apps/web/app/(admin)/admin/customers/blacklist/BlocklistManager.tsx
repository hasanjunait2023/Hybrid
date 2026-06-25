"use client";

// Add / remove blocked phone numbers. Add via a form action; remove per-row.
// Optimistic-free (server revalidates the tag → list refreshes on navigation),
// but useTransition keeps the buttons responsive and surfaces errors.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@hybrid/ui";
import { blockPhoneAction, unblockPhoneAction } from "./actions";

interface Row {
  id: string;
  phone: string;
  reason: string | null;
  createdAt: string;
}

export function BlocklistManager({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const add = (formData: FormData) => {
    setError(null);
    const phone = String(formData.get("phone") ?? "");
    const reason = String(formData.get("reason") ?? "");
    startTransition(async () => {
      const res = await blockPhoneAction(phone, reason);
      if (!res.ok) {
        setError(res.error ?? "যোগ করা যায়নি।");
        return;
      }
      router.refresh();
    });
  };

  const remove = (phone: string) => {
    startTransition(async () => {
      const res = await unblockPhoneAction(phone);
      if (!res.ok) setError(res.error ?? "সরানো যায়নি।");
      else router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <form
        action={add}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">ফোন নম্বর</span>
          <input
            name="phone"
            required
            inputMode="numeric"
            placeholder="01XXXXXXXXX"
            className="h-11 w-44 rounded-md border border-border-strong bg-surface px-3 font-mono text-sm text-ink tnum focus:border-primary focus:outline-none"
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">কারণ (ঐচ্ছিক)</span>
          <input
            name="reason"
            placeholder="যেমন: বারবার অর্ডার বাতিল"
            className="h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
          />
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "…" : "ব্লক করুন"}
        </Button>
      </form>

      {error && (
        <p role="alert" className="rounded-md bg-danger-weak px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-ink-muted">
          কোনো নম্বর ব্লক করা নেই।
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border bg-surface divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <span className="font-mono text-sm font-semibold text-ink tnum">{r.phone}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">{r.reason ?? "—"}</span>
              <button
                type="button"
                onClick={() => remove(r.phone)}
                disabled={pending}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-danger hover:bg-danger-weak disabled:opacity-50"
              >
                আনব্লক
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
