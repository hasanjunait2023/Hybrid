"use client";

// =============================================================================
// R3 — Per-category size chart modal on the PDP.
//
// Bottom-sheet on mobile (≥ DESIGN §6.1 mobile dialog rule), centered modal
// on md+. The merchant authors the chart in EITHER inch or cm and the modal
// renders the measurements verbatim — we do NOT auto-convert (a BD buyer in
// Sylhet typically wants inches; a buyer in a clothing-aware family wants
// cm; both are valid). The unit badge in the header names the unit so the
// buyer can't mistake it.
//
// Pure presentation: receives `chart` from a Server Component above and an
// `open` boolean from the PDP's "Size Guide" button. No fetch, no mutation.
// =============================================================================

import { useEffect, useState } from "react";
import type { SizeChart } from "@/lib/products/sizeChart";

export interface SizeChartModalProps {
  /** Null = merchant has not published a chart for this category. The PDP
   *  uses the null return to hide the trigger entirely. */
  chart: SizeChart | null;
  /** Localized labels (Bengali-first; English fallback). */
  labels: {
    trigger: string;
    title: string;
    close: string;
    unitInch: string;
    unitCm: string;
    hint: string;
  };
}

/** The "Size Guide" trigger button + the modal. Pure client island — receives
 *  everything it needs as props (no client-side data fetching). */
export function SizeChartModal({ chart, labels }: SizeChartModalProps) {
  const [open, setOpen] = useState(false);

  // Esc closes the modal — basic a11y that costs nothing.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!chart) return null;

  const columns = chart.chartData.columns;
  const rows = chart.chartData.rows;
  const unitLabel = chart.unit === "cm" ? labels.unitCm : labels.unitInch;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bn-body inline-flex min-h-11 items-center gap-1 self-start rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm font-semibold text-primary hover:bg-surface-2"
      >
        <span aria-hidden className="text-base leading-none">
          ⤢
        </span>
        {labels.trigger}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="size-chart-title"
          className="fixed inset-0 z-modal flex items-end justify-center bg-ink/40 md:items-center"
          onClick={(e) => {
            // Click outside the sheet (md+) / on the backdrop closes it.
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl bg-surface shadow-xl md:rounded-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <h2
                  id="size-chart-title"
                  className="bn-heading text-lg font-bold text-ink"
                >
                  {labels.title}
                </h2>
                <span className="rounded-full bg-primary-weak px-2 py-0.5 text-2xs font-semibold text-primary">
                  {unitLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={labels.close}
                className="grid h-9 w-9 place-items-center rounded-md text-ink-muted hover:bg-surface-2"
              >
                ✕
              </button>
            </div>

            {/* Hint */}
            <p className="border-b border-border px-4 py-2 text-xs text-ink-muted">
              {labels.hint}
            </p>

            {/* Table — horizontally scrollable so a 7-column chart doesn't
                break the sheet on small mobile screens. */}
            <div className="flex-1 overflow-auto px-4 py-3">
              <table className="w-full min-w-max border-collapse text-sm">
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th
                        key={c}
                        scope="col"
                        className={[
                          "sticky top-0 bg-surface-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted",
                          c === "size" && "text-ink",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={`${String(row.size)}-${i}`}
                      className="border-t border-border"
                    >
                      {columns.map((c) => (
                        <td
                          key={c}
                          className={[
                            "px-3 py-2 text-ink tnum",
                            c === "size" && "font-semibold",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {row[c] == null || row[c] === "" ? "—" : String(row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-11 w-full place-items-center rounded-md bg-primary text-sm font-semibold text-primary-fg hover:bg-primary-hover"
              >
                {labels.close}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
