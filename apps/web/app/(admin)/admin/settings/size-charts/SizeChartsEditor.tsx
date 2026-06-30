"use client";

// =============================================================================
// R3 — Size chart editor client island.
//
// Renders an editable table for a single (tenant, category) chart. The user
// picks a category on the left, the editor loads existing rows from the
// server-side prop, edits them, and saves through the Server Action. We
// keep the editor in-memory as the source of truth for the editing session
// and only send the final JSON to the server.
//
// Mobile UX: a category picker is shown first; the table is horizontally
// scrollable. Add-row / add-column sit at the bottom of the table on small
// screens.
// =============================================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SizeChart, SizeChartCategory, SizeChartUnit } from "@/lib/products/queries";
import {
  SIZE_CHART_CATEGORIES,
  SizeChartInputSchema,
} from "@/lib/products/queries";
import { saveSizeChart } from "./actions";

interface SizeChartsEditorProps {
  tenantId: string;
  existing: SizeChart[];
  /** Resolved admin.settingsComms.sizeCharts dictionary. */
  labels: {
    categoryLabel: string;
    unitLabel: string;
    columnLabel: string;
    rowLabel: string;
    addColumn: string;
    addRow: string;
    removeRow: string;
    save: string;
    saving: string;
    saved: string;
    saveFailed: string;
    loadFailed: string;
    empty: string;
    publishedEmpty: string;
    unitInch: string;
    unitCm: string;
    categories: Record<string, string>;
    invalidCategory: string;
    invalidColumns: string;
    invalidRows: string;
  };
  locale: string;
}

interface DraftRow {
  /** Stable client-side key so React keys stay stable across re-renders. */
  _key: string;
  values: Record<string, string>;
}

function emptyDraft(columns: string[]): DraftRow {
  const values: Record<string, string> = {};
  for (const c of columns) values[c] = "";
  return { _key: cryptoRandomKey(), values };
}

function cryptoRandomKey(): string {
  // Math.random is fine here — the key is just a React list key. No
  // security-sensitive reads of this value.
  return Math.random().toString(36).slice(2);
}

function rowFromServer(
  row: Record<string, string | number | null>,
  columns: string[],
): DraftRow {
  const values: Record<string, string> = {};
  for (const c of columns) {
    const v = row[c];
    values[c] = v == null ? "" : String(v);
  }
  return { _key: cryptoRandomKey(), values };
}

export function SizeChartsEditor({
  tenantId,
  existing,
  labels,
}: SizeChartsEditorProps) {
  const router = useRouter();
  const existingByCategory = useMemo(() => {
    const m = new Map<string, SizeChart>();
    for (const c of existing) m.set(c.category, c);
    return m;
  }, [existing]);

  // Default to the first category the merchant hasn't authored yet (or
  // the first category in the taxonomy if every slot is filled).
  const initialCategory = useMemo(() => {
    for (const cat of SIZE_CHART_CATEGORIES) {
      if (!existingByCategory.has(cat)) return cat;
    }
    return SIZE_CHART_CATEGORIES[0];
  }, [existingByCategory]);

  const [category, setCategory] = useState<SizeChartCategory>(initialCategory);
  const [unit, setUnit] = useState<SizeChartUnit>("inch");
  const [columns, setColumns] = useState<string[]>(["size", "chest", "length"]);
  const [rows, setRows] = useState<DraftRow[]>(() => [
    { _key: cryptoRandomKey(), values: { size: "S", chest: "36", length: "26" } },
    { _key: cryptoRandomKey(), values: { size: "M", chest: "38", length: "27" } },
    { _key: cryptoRandomKey(), values: { size: "L", chest: "40", length: "28" } },
  ]);
  const [newColumnName, setNewColumnName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function loadCategory(cat: SizeChartCategory) {
    setCategory(cat);
    const chart = existingByCategory.get(cat);
    if (!chart) {
      setUnit("inch");
      setColumns(["size", "chest", "length"]);
      setRows([
        { _key: cryptoRandomKey(), values: { size: "S", chest: "36", length: "26" } },
        { _key: cryptoRandomKey(), values: { size: "M", chest: "38", length: "27" } },
        { _key: cryptoRandomKey(), values: { size: "L", chest: "40", length: "28" } },
      ]);
      return;
    }
    setUnit(chart.unit);
    setColumns(chart.chartData.columns);
    setRows(chart.chartData.rows.map((r) => rowFromServer(r, chart.chartData.columns)));
  }

  function addColumn() {
    const name = newColumnName.trim();
    if (!name) {
      setError(labels.invalidColumns);
      return;
    }
    if (columns.includes(name)) {
      setError(labels.invalidColumns);
      return;
    }
    setColumns([...columns, name]);
    setRows(rows.map((r) => ({ ...r, values: { ...r.values, [name]: "" } })));
    setNewColumnName("");
    setError(null);
  }

  function removeColumn(name: string) {
    if (name === "size") {
      // 'size' is required by the schema — never remove it.
      return;
    }
    const nextColumns = columns.filter((c) => c !== name);
    setColumns(nextColumns);
    setRows(
      rows.map((r) => {
        const next = { ...r.values };
        delete next[name];
        return { ...r, values: next };
      }),
    );
  }

  function addRow() {
    setRows([...rows, emptyDraft(columns)]);
  }

  function removeRow(key: string) {
    if (rows.length <= 1) {
      // Schema requires at least one row.
      return;
    }
    setRows(rows.filter((r) => r._key !== key));
  }

  function updateCell(rowKey: string, column: string, value: string) {
    setRows(
      rows.map((r) =>
        r._key === rowKey
          ? { ...r, values: { ...r.values, [column]: value } }
          : r,
      ),
    );
  }

  function save() {
    setError(null);
    setSavedAt(null);

    const chartData = {
      columns,
      rows: rows.map((r) => {
        const out: Record<string, string | number | null> = {};
        for (const c of columns) {
          const v = r.values[c] ?? "";
          // Try to keep numeric cells as numbers; let text stay text so the
          // modal renders ranges ("36-40") cleanly.
          if (v === "" || v == null) out[c] = null;
          else {
            const num = Number(v);
            out[c] = Number.isFinite(num) && /^-?\d+(\.\d+)?$/.test(v.trim())
              ? num
              : v;
          }
        }
        return out;
      }),
    };

    const validation = SizeChartInputSchema.safeParse({
      category,
      unit,
      chartData,
    });
    if (!validation.success) {
      const message = validation.error.issues[0]?.message ?? labels.saveFailed;
      setError(message);
      return;
    }

    startTransition(async () => {
      const result = await saveSizeChart(tenantId, validation.data as unknown as {
        category: string;
        unit: SizeChartUnit;
        chartData: import("@/lib/products/queries").SizeChartData;
      });
      if (!result.ok) {
        setError(result.error ?? labels.saveFailed);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Category picker */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-ink">{labels.categoryLabel}</span>
          <div className="flex flex-wrap gap-2">
            {SIZE_CHART_CATEGORIES.map((cat) => {
              const active = cat === category;
              const published = existingByCategory.has(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => loadCategory(cat)}
                  className={[
                    "min-h-11 rounded-md border px-3 py-1.5 text-sm font-medium",
                    active
                      ? "border-primary bg-primary-weak text-primary"
                      : "border-border-strong bg-surface text-ink hover:bg-surface-2",
                  ].join(" ")}
                >
                  {labels.categories[cat] ?? cat}
                  {published ? (
                    <span aria-hidden className="ml-1.5 text-success">
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Unit toggle */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-ink">{labels.unitLabel}</span>
          <div className="flex gap-2" role="radiogroup" aria-label={labels.unitLabel}>
            {(["inch", "cm"] as SizeChartUnit[]).map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={unit === u}
                onClick={() => setUnit(u)}
                className={[
                  "min-h-11 rounded-md border px-3 py-1.5 text-sm font-medium",
                  unit === u
                    ? "border-primary bg-primary-weak text-primary"
                    : "border-border-strong bg-surface text-ink hover:bg-surface-2",
                ].join(" ")}
              >
                {u === "cm" ? labels.unitCm : labels.unitInch}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table editor */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c}
                    scope="col"
                    className="border-b border-border bg-surface-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted"
                  >
                    <div className="flex items-center gap-2">
                      <span>{c}</span>
                      {c !== "size" ? (
                        <button
                          type="button"
                          onClick={() => removeColumn(c)}
                          aria-label={`${labels.removeRow} ${c}`}
                          className="text-ink-subtle hover:text-danger"
                        >
                          ✕
                        </button>
                      ) : null}
                    </div>
                  </th>
                ))}
                <th scope="col" className="w-10 border-b border-border bg-surface-2 px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._key} className="border-t border-border">
                  {columns.map((c) => (
                    <td key={c} className="px-2 py-1">
                      <input
                        type={c === "size" ? "text" : "text"}
                        value={r.values[c] ?? ""}
                        onChange={(e) => updateCell(r._key, c, e.target.value)}
                        placeholder={c === "size" ? labels.rowLabel : ""}
                        inputMode={c === "size" ? "text" : "decimal"}
                        className="h-9 w-full rounded border border-border-strong bg-surface px-2 text-sm text-ink tnum focus:border-primary focus:outline-none"
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(r._key)}
                      aria-label={labels.removeRow}
                      disabled={rows.length <= 1}
                      className="grid h-9 w-9 place-items-center rounded text-ink-subtle hover:bg-surface-2 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add row / add column */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border bg-surface-2 px-3 py-3">
          <button
            type="button"
            onClick={addRow}
            className="min-h-11 rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink hover:bg-surface"
          >
            + {labels.addRow}
          </button>

          <div className="flex flex-1 items-center gap-2">
            <input
              type="text"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              placeholder={labels.columnLabel}
              className="h-11 flex-1 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={addColumn}
              className="min-h-11 rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink hover:bg-surface-2"
            >
              + {labels.addColumn}
            </button>
          </div>
        </div>
      </div>

      {/* Save controls + status */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          {error ? (
            <span className="font-semibold text-danger">{error}</span>
          ) : savedAt ? (
            <span className="font-semibold text-success">{labels.saved}</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="grid min-h-11 place-items-center rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? labels.saving : labels.save}
        </button>
      </div>

      {/* Existing charts legend */}
      {existing.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-surface px-3 py-2 text-sm text-ink-muted">
          {labels.empty}
        </p>
      ) : (
        <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-muted">
          {existing.length} {existing.length === 1 ? "chart" : "charts"} published
          across {SIZE_CHART_CATEGORIES.length} categories.
        </div>
      )}
    </div>
  );
}
