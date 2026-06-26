"use client";

// Date range picker + export buttons for the reports page. Local state for
// the form; calls Server Actions to generate CSV.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { exportSalesCsv, exportTopProductsCsv } from "./export-actions";
import { presetRange, type DateRange } from "@/lib/admin/reports";

const PRESETS = [
  { id: "today", labelEn: "Today", labelBn: "আজ" },
  { id: "7d", labelEn: "7 days", labelBn: "৭ দিন" },
  { id: "30d", labelEn: "30 days", labelBn: "৩০ দিন" },
  { id: "mtd", labelEn: "Month to date", labelBn: "এই মাস" },
  { id: "ytd", labelEn: "Year to date", labelBn: "এই বছর" },
] as const;

type PresetId = typeof PRESETS[number]["id"];

export function ReportsControls({
  initialRange,
  locale = "en",
}: {
  initialRange: DateRange;
  locale?: "en" | "bn";
}) {
  const router = useRouter();
  const [range, setRange] = useState<DateRange>(initialRange);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const setPreset = (id: PresetId) => {
    setRange(presetRange(id));
  };

  const handleExport = (kind: "sales" | "products") => {
    setError(null);
    startTransition(async () => {
      const action = kind === "sales" ? exportSalesCsv : exportTopProductsCsv;
      const res = await action(range);
      if (!res.ok || !res.dataUri) {
        setError(res.error ?? "ব্যর্থ");
        return;
      }
      // Trigger download via anchor click.
      const a = document.createElement("a");
      a.href = res.dataUri;
      a.download = res.filename ?? "export.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  };

  const apply = () => {
    // Round-trip through the URL so the server re-renders with new range.
    const params = new URLSearchParams({ from: range.from, to: range.to });
    router.push(`/admin/reports?${params.toString()}`);
  };

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPreset(p.id)}
            className="rounded-full border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-2"
          >
            {locale === "bn" ? p.labelBn : p.labelEn}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-2xs font-semibold text-ink-muted">
          {locale === "bn" ? "থেকে" : "From"}
          <input
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="mt-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink"
          />
        </label>
        <label className="flex flex-col text-2xs font-semibold text-ink-muted">
          {locale === "bn" ? "পর্যন্ত" : "To"}
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="mt-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink"
          />
        </label>
        <button
          type="button"
          onClick={apply}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-ink-on-primary shadow-xs hover:bg-primary-hover"
        >
          {locale === "bn" ? "প্রয়োগ" : "Apply"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handleExport("sales")}
          disabled={pending}
          className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-2 disabled:opacity-50"
        >
          📊 {locale === "bn" ? "বিক্রি CSV" : "Export sales CSV"}
        </button>
        <button
          type="button"
          onClick={() => handleExport("products")}
          disabled={pending}
          className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-2 disabled:opacity-50"
        >
          📦 {locale === "bn" ? "পণ্য CSV" : "Export products CSV"}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-2xs font-semibold text-danger">{error}</p>
      )}
    </section>
  );
}