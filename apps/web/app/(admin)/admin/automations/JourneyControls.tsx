"use client";

// CRM automation client islands — create form, row pause/delete, and Run-now.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Messages } from "@/lib/i18n/dictionaries";
import {
  createJourneyAction,
  toggleJourneyAction,
  deleteJourneyAction,
  runNowAction,
} from "./actions";

type T = Messages["admin"]["journeys"];

export function CreateJourneyForm({ t }: { t: T }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (fd: FormData) => {
    setError(null);
    start(async () => {
      const res = await createJourneyAction({
        name: fd.get("name"),
        trigger: fd.get("trigger"),
        message: fd.get("message"),
        thresholdDays: fd.get("thresholdDays") || 0,
        minOrders: fd.get("minOrders") || 0,
      });
      if (!res.ok) {
        setError(res.error ?? t.addFailed);
        return;
      }
      router.refresh();
      (document.getElementById("journey-form") as HTMLFormElement | null)?.reset();
    });
  };

  return (
    <form id="journey-form" action={submit} className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-1" style={{ minWidth: 180 }}>
          <span className="text-2xs font-semibold uppercase text-ink-muted">{t.nameLabel}</span>
          <input name="name" required maxLength={120} placeholder={t.namePlaceholder} className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-2xs font-semibold uppercase text-ink-muted">{t.triggerLabel}</span>
          <select name="trigger" defaultValue="review_request" className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm">
            <option value="review_request">{t.trigger.review_request}</option>
            <option value="win_back">{t.trigger.win_back}</option>
            <option value="repeat_buyer">{t.trigger.repeat_buyer}</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase text-ink-muted">{t.messageLabel}</span>
        <textarea name="message" required maxLength={640} rows={2} placeholder={t.messagePlaceholder} className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm" />
        <span className="text-2xs text-ink-subtle">{t.messageHint}</span>
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-2xs font-semibold uppercase text-ink-muted">{t.thresholdLabel}</span>
          <input name="thresholdDays" type="number" min={0} defaultValue={2} className="h-9 w-24 rounded-md border border-border-strong bg-surface px-2 font-mono text-sm tnum" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-2xs font-semibold uppercase text-ink-muted">{t.minOrdersLabel}</span>
          <input name="minOrders" type="number" min={0} defaultValue={2} className="h-9 w-24 rounded-md border border-border-strong bg-surface px-2 font-mono text-sm tnum" />
        </label>
        <button type="submit" disabled={pending} className="h-9 rounded-md bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? t.adding : t.add}
        </button>
      </div>
      <p className="text-2xs text-ink-subtle">{t.thresholdHint} · {t.minOrdersHint}</p>
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </form>
  );
}

export function JourneyRowActions({ id, active, t }: { id: string; active: boolean; t: T }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) router.refresh();
    });
  return (
    <span className="inline-flex items-center gap-3">
      <button type="button" disabled={pending} onClick={() => run(() => toggleJourneyAction(id, !active))} className="text-2xs font-semibold text-primary hover:underline disabled:opacity-50">
        {active ? t.pause : t.activate}
      </button>
      <button type="button" disabled={pending} onClick={() => run(() => deleteJourneyAction(id))} className="text-2xs font-semibold text-danger hover:underline disabled:opacity-50">
        {t.delete}
      </button>
    </span>
  );
}

export function RunNowButton({ t }: { t: T }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await runNowAction();
            if (r.ok) {
              setMsg(t.ranResult.replace("{sent}", String(r.sent ?? 0)).replace("{failed}", String(r.failed ?? 0)));
              router.refresh();
            }
          })
        }
        className="h-9 rounded-md border border-border-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-2 disabled:opacity-50"
      >
        {pending ? t.running : t.runNow}
      </button>
      {msg && <span className="text-xs font-medium text-success">{msg}</span>}
    </div>
  );
}
