"use client";

// CSV import form (P2-5). Paste CSV or pick a .csv file; submit to the import
// action; show created count + per-row failures. Latin numerals.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@hybrid/ui";
import { useDict, useLocale } from "@/lib/i18n/provider";
import { formatNumber } from "@/lib/i18n/format";
import { importProductsAction, type ImportActionResult } from "./actions";

export function ImportForm() {
  const router = useRouter();
  const locale = useLocale();
  const t = useDict().admin.products.import;
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportActionResult | null>(null);

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const submit = () => {
    setResult(null);
    startTransition(async () => {
      const res = await importProductsAction(text);
      setResult(res);
      if (res.ok && (res.created ?? 0) > 0) router.refresh();
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          className="text-sm text-ink-muted file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink"
        />
        <button type="button" onClick={() => setText(t.sampleCsv)} className="text-xs font-semibold text-primary hover:underline">
          {t.insertSample}
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={t.pastePlaceholder}
        className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-xs text-ink focus:border-primary focus:outline-none"
      />
      <Button onClick={submit} disabled={pending || text.trim().length === 0}>
        {pending ? t.importing : t.runImport}
      </Button>

      {result && (
        <div className="space-y-2 rounded-md bg-surface-2 p-3 text-sm">
          {result.ok ? (
            <p className="font-semibold text-success">{formatNumber(result.created ?? 0, locale)} {t.createdSuffix}</p>
          ) : (
            <p className="font-semibold text-danger">{result.error}</p>
          )}
          {(result.parseErrors?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink-muted">{t.rowErrors}</p>
              <ul className="text-xs text-danger">
                {result.parseErrors!.slice(0, 10).map((e, i) => (
                  <li key={i}>{t.lineLabel} {formatNumber(e.line, locale)}: {e.reason}</li>
                ))}
              </ul>
            </div>
          )}
          {(result.failed?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink-muted">{t.notAdded}</p>
              <ul className="text-xs text-danger">
                {result.failed!.slice(0, 10).map((f, i) => (
                  <li key={i}>{f.title}: {f.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
