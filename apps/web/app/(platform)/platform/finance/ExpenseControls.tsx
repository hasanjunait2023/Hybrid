"use client";

// Platform expense entry + delete (PP1-B2).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@hybrid/ui";
import { addExpenseAction, deleteExpenseAction } from "./actions";

const CATEGORIES = ["infra", "sms", "courier", "gateway", "salary", "marketing", "other"];

export function ExpenseForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const add = (fd: FormData) => {
    setError(null);
    const raw = {
      category: String(fd.get("category") ?? "other"),
      vendor: String(fd.get("vendor") ?? "") || undefined,
      amount: fd.get("amount"),
      note: String(fd.get("note") ?? "") || undefined,
      incurredOn: String(fd.get("incurredOn") ?? "") || undefined,
    };
    start(async () => {
      const res = await addExpenseAction(raw);
      if (!res.ok) { setError(res.error ?? "ব্যর্থ"); return; }
      router.refresh();
    });
  };

  return (
    <form action={add} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
      <label className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase text-ink-muted">ক্যাটাগরি</span>
        <select name="category" defaultValue="infra" className="h-10 rounded-md border border-border-strong bg-surface px-2 text-sm">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-2xs font-semibold uppercase text-ink-muted">ভেন্ডর/বিবরণ</span>
        <input name="vendor" placeholder="যেমন: VPS, sms.net.bd" className="h-10 w-full rounded-md border border-border-strong bg-surface px-2 text-sm" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase text-ink-muted">পরিমাণ</span>
        <input name="amount" type="number" min={0} required className="h-10 w-24 rounded-md border border-border-strong bg-surface px-2 font-mono text-sm tnum" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase text-ink-muted">তারিখ</span>
        <input name="incurredOn" type="date" className="h-10 rounded-md border border-border-strong bg-surface px-2 text-sm" />
      </label>
      <Button type="submit" disabled={pending}>{pending ? "…" : "যোগ"}</Button>
      {error && <p className="w-full text-xs font-medium text-danger">{error}</p>}
    </form>
  );
}

export function DeleteExpense({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { const r = await deleteExpenseAction(id); if (r.ok) router.refresh(); })}
      className="rounded-md px-1.5 py-0.5 text-2xs font-semibold text-danger hover:bg-danger-weak disabled:opacity-50"
      aria-label="মুছুন"
    >
      ✕
    </button>
  );
}
