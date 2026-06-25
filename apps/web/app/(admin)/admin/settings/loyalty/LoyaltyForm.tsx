"use client";

// Loyalty program settings form (P3-2). Toggle + earn/redeem rates; saves via
// the action. A live example line translates the rates into plain Bengali.
import { useState, useTransition } from "react";
import { Button } from "@hybrid/ui";
import { updateLoyaltyAction } from "./actions";

interface Program {
  enabled: boolean;
  earnPer100: number;
  takaPerPoint: number;
}

export function LoyaltyForm({ program }: { program: Program }) {
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(program.enabled);
  const [earn, setEarn] = useState(String(program.earnPer100));
  const [taka, setTaka] = useState(String(program.takaPerPoint));
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const earnN = Number(earn) || 0;
  const takaN = Number(taka) || 0;

  const save = () => {
    setNote(null);
    setError(null);
    startTransition(async () => {
      const res = await updateLoyaltyAction(enabled, earnN, takaN);
      if (!res.ok) setError(res.error ?? "সংরক্ষণ ব্যর্থ।");
      else setNote("সংরক্ষিত হয়েছে।");
    });
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-4 shadow-xs">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-5 w-5 rounded border-border-strong accent-primary"
        />
        <span className="text-sm font-semibold text-ink">লয়্যালটি প্রোগ্রাম চালু করুন</span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">প্রতি ১০০৳-এ পয়েন্ট</span>
          <input
            type="number" min={0} value={earn} onChange={(e) => setEarn(e.target.value)}
            className="h-11 rounded-md border border-border-strong bg-surface px-3 font-mono text-sm text-ink tnum focus:border-primary focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">১ পয়েন্ট = কত টাকা</span>
          <input
            type="number" min={0} step="0.5" value={taka} onChange={(e) => setTaka(e.target.value)}
            className="h-11 rounded-md border border-border-strong bg-surface px-3 font-mono text-sm text-ink tnum focus:border-primary focus:outline-none"
          />
        </label>
      </div>

      <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-muted">
        উদাহরণ: ১০০০৳ অর্ডারে গ্রাহক পাবে <span className="font-semibold text-ink tnum">{Math.floor(1000 / 100) * earnN}</span> পয়েন্ট,
        যার মূল্য <span className="font-semibold text-ink tnum">{(Math.floor(1000 / 100) * earnN * takaN).toFixed(0)}৳</span>।
      </p>

      {error && <p className="text-xs font-medium text-danger">{error}</p>}
      {note && <p className="text-xs font-medium text-success">{note}</p>}

      <Button onClick={save} disabled={pending}>{pending ? "…" : "সংরক্ষণ করুন"}</Button>
    </div>
  );
}
