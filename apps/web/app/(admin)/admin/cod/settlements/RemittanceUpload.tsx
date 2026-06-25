"use client";

// Remittance CSV upload (DESIGN §Q3.3). Opens a sheet: select CSV + optional
// reference -> submit -> the Server Action parses, matches, and reports
// matched/unmatched/discrepancy counts. Unmatched lines are FIRST-CLASS feedback
// (warning), never a silent failure; a hard parse error names the problem.
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@hybrid/ui";
import { useDict, useLocale } from "@/lib/i18n/provider";
import { formatNumber } from "@/lib/i18n/format";
import { uploadRemittance, type UploadResult } from "./settlement-actions";

export function RemittanceUpload() {
  const d = useDict();
  const t = d.admin.cod.remittance;
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<UploadResult | null, FormData>(uploadRemittance, null);

  return (
    <div className="relative">
      <Button type="button" onClick={() => setOpen((v) => !v)}>
        {t.upload}
      </Button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border border-border bg-surface p-4 shadow-md">
          <form action={formAction} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-ink-muted">{t.csvLabel}</label>
              <input
                type="file"
                name="csv"
                accept=".csv,text/csv"
                required
                className="mt-1 w-full text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-muted">{t.referenceLabel}</label>
              <input
                type="text"
                name="reference"
                placeholder={t.referencePlaceholder}
                className="mt-1 w-full rounded-md border border-border-strong px-2 py-1.5 text-sm"
              />
            </div>
            <p className="text-2xs text-ink-subtle">
              {t.hint}
            </p>
            <SubmitButton />
          </form>

          {state && <UploadFeedback state={state} />}
        </div>
      )}
    </div>
  );
}

function SubmitButton() {
  const d = useDict();
  const t = d.admin.cod.remittance;
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? t.submitting : t.submit}
    </Button>
  );
}

function UploadFeedback({ state }: { state: UploadResult }) {
  const d = useDict();
  const locale = useLocale();
  const t = d.admin.cod.remittance;
  if (!state.ok) {
    return (
      <div className="mt-3 rounded-md bg-danger-weak px-3 py-2 text-xs text-danger" role="alert">
        {state.error}
        {state.parseErrors && state.parseErrors.length > 0 && (
          <ul className="mt-1 list-disc pl-4">
            {state.parseErrors.slice(0, 5).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-md bg-cod-weak px-3 py-2 text-xs text-cod">
      <p className="font-semibold">
        {formatNumber(state.matchedCount ?? 0, locale)} {t.matchedLines} · {formatNumber(state.unmatchedCount ?? 0, locale)} {t.unmatchedLines}
      </p>
      {state.discrepancyCount ? (
        <p className="mt-0.5 text-warning">{formatNumber(state.discrepancyCount, locale)} {t.discrepanciesFound}</p>
      ) : null}
    </div>
  );
}
