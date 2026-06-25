"use client";

// Client controls for platform billing (PP1-A3): run the billing sweep, extend a
// trial, mark an invoice paid. Each surfaces its result inline.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useDict, useLocale } from "@/lib/i18n/provider";
import { formatNumber } from "@/lib/i18n/format";
import { extendTrialAction, markInvoicePaidAction, runSweepAction } from "./actions";

export function BillingControls() {
  const d = useDict();
  const locale = useLocale();
  const tx = d.platform.billing;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const sweep = () =>
    start(async () => {
      const res = await runSweepAction();
      setMsg(res.ok ? `${tx.sweepDone} — ${formatNumber(res.swept ?? 0, locale)} ${tx.changesUnit}।` : (res.error ?? d.platform.common.failed));
      if (res.ok) router.refresh();
    });

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-2xs text-ink-muted">{msg}</span>}
      <button
        type="button"
        onClick={sweep}
        disabled={pending}
        className="rounded-md border border-border-strong px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-2 disabled:opacity-50"
      >
        {pending ? "…" : tx.runSweep}
      </button>
    </div>
  );
}

export function ExtendTrial({ tenantId }: { tenantId: string }) {
  const d = useDict();
  const tx = d.platform.billing;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [days, setDays] = useState("7");

  const extend = () =>
    start(async () => {
      const res = await extendTrialAction(tenantId, Number(days) || 7);
      if (res.ok) router.refresh();
    });

  return (
    <span className="flex items-center gap-1">
      <input
        type="number"
        min={1}
        max={365}
        value={days}
        onChange={(e) => setDays(e.target.value)}
        className="h-8 w-12 rounded-md border border-border-strong bg-surface px-1 text-center font-mono text-xs tnum"
        aria-label={tx.daysLabel}
      />
      <button
        type="button"
        onClick={extend}
        disabled={pending}
        className="rounded-md border border-border-strong px-2 py-1 text-2xs font-semibold text-ink hover:bg-surface-2 disabled:opacity-50"
      >
        {tx.extendTrial}
      </button>
    </span>
  );
}

export function MarkPaid({ invoiceId }: { invoiceId: string }) {
  const d = useDict();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(async () => { const r = await markInvoicePaidAction(invoiceId); if (r.ok) router.refresh(); })}
      disabled={pending}
      className="rounded-md bg-success px-2 py-1 text-2xs font-semibold text-ink-on-primary hover:opacity-90 disabled:opacity-50"
    >
      {d.platform.billing.markPaid}
    </button>
  );
}
