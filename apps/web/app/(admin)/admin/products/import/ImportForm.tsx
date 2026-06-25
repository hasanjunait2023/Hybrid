"use client";

// CSV import form (P2-5). Paste CSV or pick a .csv file; submit to the import
// action; show created count + per-row failures. Latin numerals.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@hybrid/ui";
import { importProductsAction, type ImportActionResult } from "./actions";

const SAMPLE = "title,price,inventory,status\nসুতি পাঞ্জাবি,1290,20,active\nডেনিম শার্ট,990,15,draft";

export function ImportForm() {
  const router = useRouter();
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
        <button type="button" onClick={() => setText(SAMPLE)} className="text-xs font-semibold text-primary hover:underline">
          নমুনা বসান
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder="এখানে CSV পেস্ট করুন…"
        className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-xs text-ink focus:border-primary focus:outline-none"
      />
      <Button onClick={submit} disabled={pending || text.trim().length === 0}>
        {pending ? "ইম্পোর্ট হচ্ছে…" : "ইম্পোর্ট করুন"}
      </Button>

      {result && (
        <div className="space-y-2 rounded-md bg-surface-2 p-3 text-sm">
          {result.ok ? (
            <p className="font-semibold text-success">{result.created ?? 0} টি পণ্য যোগ হয়েছে।</p>
          ) : (
            <p className="font-semibold text-danger">{result.error}</p>
          )}
          {(result.parseErrors?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink-muted">সারি ত্রুটি:</p>
              <ul className="text-xs text-danger">
                {result.parseErrors!.slice(0, 10).map((e, i) => (
                  <li key={i}>লাইন {e.line}: {e.reason}</li>
                ))}
              </ul>
            </div>
          )}
          {(result.failed?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink-muted">যোগ হয়নি:</p>
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
