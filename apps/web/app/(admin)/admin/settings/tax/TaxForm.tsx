"use client";

// O13 — Tax / Business settings form. TIN (12 digits) + BIN (10 digits) per
// Bangladesh NBR spec. Sticky save enabled only when dirty. Live client-side
// validation mirrors the Zod schema (and the DB CHECK constraints) so the
// merchant sees a Bengali error before round-tripping.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@hybrid/ui";
import { useDict } from "@/lib/i18n/provider";
import { saveTenantTax } from "./actions";
// Import the schema primitives from the client-safe module so webpack's
// client bundle never pulls in @hybrid/db / postgres.js.
import { TIN_REGEX, BIN_REGEX } from "@/lib/settings/tenantTaxSchema";

const inputCls =
  "h-11 w-full rounded-sm border border-border-strong bg-surface px-3 font-mono text-base text-ink placeholder:text-ink-subtle focus-visible:border-primary";

interface TaxFormProps {
  initialTin: string | null;
  initialBin: string | null;
}

export function TaxForm({ initialTin, initialBin }: TaxFormProps) {
  const router = useRouter();
  const d = useDict();
  const t = d.admin.settingsGeneral.tax;
  const [tin, setTin] = useState(initialTin ?? "");
  const [bin, setBin] = useState(initialBin ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = tin !== (initialTin ?? "") || bin !== (initialBin ?? "");

  function validateClient(): string | null {
    const tinTrim = tin.trim();
    const binTrim = bin.trim();
    if (tinTrim !== "" && !TIN_REGEX.test(tinTrim)) return t.errorTinInvalid;
    if (binTrim !== "" && !BIN_REGEX.test(binTrim)) return t.errorBinInvalid;
    return null;
  }

  function save() {
    setError(null);
    setSaved(false);
    const localErr = validateClient();
    if (localErr) {
      setError(localErr);
      return;
    }
    const fd = new FormData();
    fd.set("tin", tin.trim());
    fd.set("bin", bin.trim());
    startTransition(async () => {
      const result = await saveTenantTax(null, fd);
      if (!result.ok) setError(result.error ?? t.saveFailed);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  const tinTrim = tin.trim();
  const binTrim = bin.trim();
  const tinError = tinTrim !== "" && !TIN_REGEX.test(tinTrim);
  const binError = binTrim !== "" && !BIN_REGEX.test(binTrim);

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div>
        <label htmlFor="tin" className="mb-1 block text-sm font-semibold text-ink">
          {t.tinLabel}
        </label>
        <p className="mb-1 text-xs text-ink-muted">{t.tinHint}</p>
        <input
          id="tin"
          inputMode="numeric"
          autoComplete="off"
          placeholder={t.tinPlaceholder}
          value={tin}
          onChange={(e) => {
            // Allow only digits in the input — anything else is noise.
            const next = e.target.value.replace(/\D+/g, "").slice(0, 12);
            setTin(next);
          }}
          className={`${inputCls} ${tinError ? "border-danger focus-visible:border-danger" : ""}`}
          aria-invalid={tinError || undefined}
        />
      </div>

      <div>
        <label htmlFor="bin" className="mb-1 block text-sm font-semibold text-ink">
          {t.binLabel}
        </label>
        <p className="mb-1 text-xs text-ink-muted">{t.binHint}</p>
        <input
          id="bin"
          inputMode="numeric"
          autoComplete="off"
          placeholder={t.binPlaceholder}
          value={bin}
          onChange={(e) => {
            const next = e.target.value.replace(/\D+/g, "").slice(0, 10);
            setBin(next);
          }}
          className={`${inputCls} ${binError ? "border-danger focus-visible:border-danger" : ""}`}
          aria-invalid={binError || undefined}
        />
      </div>

      <p className="text-xs text-ink-muted">{t.blankExplainer}</p>

      {/* Tiny live preview of what the invoice will print. */}
      {(tinTrim || binTrim) && (
        <div className="rounded-md border border-border-strong bg-surface-2 p-3">
          <p className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">
            {t.invoicePreview}
          </p>
          <div className="mt-1 space-y-0.5 font-mono text-xs text-ink">
            {tinTrim && <p>{t.invoicePreviewTin} {tinTrim}</p>}
            {binTrim && <p>{t.invoicePreviewBin} {binTrim}</p>}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-danger-weak px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="rounded-md bg-success-weak px-3 py-2 text-sm font-medium text-success">
          {t.saved}
        </p>
      )}

      <Button onClick={save} disabled={pending || !dirty}>
        {pending ? t.saving : t.save}
      </Button>
    </section>
  );
}