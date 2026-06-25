"use client";

// Loyalty program settings form (P3-2). Toggle + earn/redeem rates; saves via
// the action. A live example line translates the rates into plain Bengali.
import { useState, useTransition } from "react";
import { Button } from "@hybrid/ui";
import { useDict, useLocale } from "@/lib/i18n/provider";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { updateLoyaltyAction } from "./actions";

interface Program {
  enabled: boolean;
  earnPer100: number;
  takaPerPoint: number;
}

export function LoyaltyForm({ program }: { program: Program }) {
  const t = useDict().admin.settingsGeneral.loyalty;
  const locale = useLocale();
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
      if (!res.ok) setError(res.error ?? t.saveFailed);
      else setNote(t.saved);
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
        <span className="text-sm font-semibold text-ink">{t.enable}</span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">{t.pointsPer100}</span>
          <input
            type="number" min={0} value={earn} onChange={(e) => setEarn(e.target.value)}
            className="h-11 rounded-md border border-border-strong bg-surface px-3 font-mono text-sm text-ink tnum focus:border-primary focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">{t.takaPerPoint}</span>
          <input
            type="number" min={0} step="0.5" value={taka} onChange={(e) => setTaka(e.target.value)}
            className="h-11 rounded-md border border-border-strong bg-surface px-3 font-mono text-sm text-ink tnum focus:border-primary focus:outline-none"
          />
        </label>
      </div>

      <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-muted">
        {t.example} <span className="font-semibold text-ink tnum">{formatNumber(Math.floor(1000 / 100) * earnN, locale)}</span> {t.examplePointsUnit}
        {" "}{t.exampleWorth} <span className="font-semibold text-ink tnum">{formatMoney(Math.round(Math.floor(1000 / 100) * earnN * takaN), locale)}</span>{t.exampleEnd}
      </p>

      {error && <p className="text-xs font-medium text-danger">{error}</p>}
      {note && <p className="text-xs font-medium text-success">{note}</p>}

      <Button onClick={save} disabled={pending}>{pending ? "…" : t.save}</Button>
    </div>
  );
}
