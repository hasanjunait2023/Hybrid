"use client";

// Wholesale marketplace monthly-fee controls (super-admin). Inline fee editor per
// wholesaler, a "generate this month" button, and per-line paid/waive/reopen.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@hybrid/ui";
import { setMonthlyFeeAction, generateFeesAction, setFeeStatusAction } from "./actions";

export function GenerateButton({ period }: { period: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await generateFeesAction(period);
            if (!r.ok) { setError(r.error ?? "ব্যর্থ হয়েছে।"); return; }
            router.refresh();
          })
        }
      >
        {pending ? "…" : "এই মাসের ফি তৈরি করুন"}
      </Button>
      {error && <span className="text-xs font-medium text-danger">{error}</span>}
    </div>
  );
}

export function FeeEditor({ tenantId, current }: { tenantId: string; current: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(String(current));
  const dirty = value !== String(current);

  const save = (fd: FormData) => {
    const amount = fd.get("amount");
    start(async () => {
      const r = await setMonthlyFeeAction({ tenantId, amount });
      if (r.ok) router.refresh();
    });
  };

  return (
    <form action={save} className="flex items-center gap-1.5">
      <input
        name="amount"
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-24 rounded-md border border-border-strong bg-surface px-2 font-mono text-sm tnum"
      />
      <button
        type="submit"
        disabled={pending || !dirty}
        className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
      >
        {pending ? "…" : "সেভ"}
      </button>
    </form>
  );
}

export function StatusButtons({ feeId, status }: { feeId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (next: "pending" | "paid" | "waived") =>
    start(async () => {
      const r = await setFeeStatusAction({ feeId, status: next });
      if (r.ok) router.refresh();
    });

  return (
    <div className="flex items-center gap-1.5">
      {status !== "paid" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => set("paid")}
          className="rounded-md bg-success px-2 py-0.5 text-2xs font-semibold text-white disabled:opacity-40"
        >
          পরিশোধিত
        </button>
      )}
      {status !== "waived" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => set("waived")}
          className="rounded-md border border-border-strong px-2 py-0.5 text-2xs font-semibold text-ink-muted disabled:opacity-40"
        >
          মওকুফ
        </button>
      )}
      {status !== "pending" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => set("pending")}
          className="rounded-md px-2 py-0.5 text-2xs font-semibold text-ink-muted underline disabled:opacity-40"
        >
          রিওপেন
        </button>
      )}
    </div>
  );
}
