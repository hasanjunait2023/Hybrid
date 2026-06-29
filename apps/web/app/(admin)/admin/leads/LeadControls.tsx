"use client";

// CRM lead client islands — create form + per-lead stage/convert/delete actions.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Messages } from "@/lib/i18n/dictionaries";
import {
  createLeadAction,
  setLeadStageAction,
  convertLeadAction,
  deleteLeadAction,
} from "./actions";

type T = Messages["admin"]["leads"];

export function CreateLeadForm({ t }: { t: T }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (fd: FormData) => {
    setError(null);
    start(async () => {
      const res = await createLeadAction({
        name: fd.get("name") || "",
        phone: fd.get("phone") || "",
        source: fd.get("source") || "manual",
        estValue: fd.get("estValue") || 0,
        note: fd.get("note") || "",
      });
      if (!res.ok) {
        setError(res.error ?? t.addFailed);
        return;
      }
      router.refresh();
      (document.getElementById("lead-form") as HTMLFormElement | null)?.reset();
    });
  };

  return (
    <form
      id="lead-form"
      action={submit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <label className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase text-ink-muted">{t.nameLabel}</span>
        <input name="name" maxLength={120} placeholder={t.namePlaceholder} className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase text-ink-muted">{t.phoneLabel}</span>
        <input name="phone" maxLength={20} placeholder={t.phonePlaceholder} className="h-9 w-36 rounded-md border border-border-strong bg-surface px-2 font-mono text-sm tnum" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase text-ink-muted">{t.sourceLabel}</span>
        <select name="source" defaultValue="manual" className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm">
          <option value="manual">{t.source.manual}</option>
          <option value="inquiry">{t.source.inquiry}</option>
          <option value="facebook">{t.source.facebook}</option>
          <option value="whatsapp">{t.source.whatsapp}</option>
          <option value="abandoned_cart">{t.source.abandoned_cart}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase text-ink-muted">{t.valueLabel}</span>
        <input name="estValue" type="number" min={0} defaultValue={0} className="h-9 w-28 rounded-md border border-border-strong bg-surface px-2 font-mono text-sm tnum" />
      </label>
      <label className="flex flex-1 flex-col gap-1" style={{ minWidth: 160 }}>
        <span className="text-2xs font-semibold uppercase text-ink-muted">{t.noteLabel}</span>
        <input name="note" maxLength={2000} placeholder={t.notePlaceholder} className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm" />
      </label>
      <button type="submit" disabled={pending} className="h-9 rounded-md bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? t.adding : t.add}
      </button>
      {error && <p className="w-full text-xs font-medium text-danger">{error}</p>}
    </form>
  );
}

export function LeadRowActions({
  id,
  nextStage,
  closed,
  canConvert,
  customerId,
  t,
}: {
  id: string;
  /** the stage "Advance" moves to, or null at the end of the pipeline. */
  nextStage: string | null;
  /** true when the lead is already won or lost (terminal). */
  closed: boolean;
  canConvert: boolean;
  customerId: string | null;
  t: T;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? null);
        return;
      }
      router.refresh();
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {customerId && (
          <Link href={`/admin/customers/${customerId}`} className="text-2xs font-semibold text-success hover:underline">
            {t.viewCustomer}
          </Link>
        )}
        {!closed && nextStage && (
          <button type="button" disabled={pending} onClick={() => run(() => setLeadStageAction(id, nextStage))} className="text-2xs font-semibold text-primary hover:underline disabled:opacity-50">
            {t.advance} →
          </button>
        )}
        {!closed && (
          <button
            type="button"
            disabled={pending}
            onClick={() => (canConvert ? run(() => convertLeadAction(id)) : setError(t.convertNoPhone))}
            className="text-2xs font-semibold text-success hover:underline disabled:opacity-50"
          >
            {t.convert}
          </button>
        )}
        {!closed && (
          <button type="button" disabled={pending} onClick={() => run(() => setLeadStageAction(id, "lost"))} className="text-2xs font-semibold text-ink-muted hover:underline disabled:opacity-50">
            {t.markLost}
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => run(() => deleteLeadAction(id))} className="text-2xs font-semibold text-danger hover:underline disabled:opacity-50">
          {t.delete}
        </button>
      </div>
      {error && <p className="text-2xs font-medium text-danger">{error}</p>}
    </div>
  );
}
