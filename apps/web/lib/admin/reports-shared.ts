// Client-safe subset of `reports.ts` — date helpers + CSV serialization only.
// No DB / crypto imports, safe to import from "use client" components.
//
// Keep this file dependency-free (only `Date` + simple math) so the bundler
// can include it in client bundles without pulling in postgres.js /
// node:crypto transitively.

export type ReportPreset = "today" | "7d" | "30d" | "mtd" | "ytd";

export interface DateRange {
  /** inclusive Dhaka-local start date, 'YYYY-MM-DD'. */
  from: string;
  /** inclusive Dhaka-local end date, 'YYYY-MM-DD'. */
  to: string;
}

/** Bangladesh has no DST; fixed +06:00 offset. */
const DHAKA_OFFSET_MIN = 6 * 60;

/** Return YYYY-MM-DD for "today" in Asia/Dhaka, given a Date (UTC). */
export function todayDhaka(d: Date = new Date()): string {
  const local = new Date(d.getTime() + DHAKA_OFFSET_MIN * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Add `days` to a YYYY-MM-DD string (Dhaka local). */
export function addDays(yyyymmdd: string, days: number): string {
  const parts = yyyymmdd.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const dd = parts[2] ?? 1;
  const dt = new Date(Date.UTC(y, m - 1, dd));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function presetRange(preset: ReportPreset): DateRange {
  const today = todayDhaka();
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "mtd": {
      const parts = today.split("-").map(Number);
      const y = parts[0] ?? 1970;
      const m = parts[1] ?? 1;
      const first = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
      return { from: first, to: today };
    }
    case "ytd": {
      const y = Number(today.slice(0, 4));
      return { from: `${y}-01-01`, to: today };
    }
  }
}

export function defaultRange(todayDhaka: string): DateRange {
  return { from: addDays(todayDhaka, -29), to: todayDhaka };
}

/** Minimal RFC-4180 CSV serializer. Header row + body rows. */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T & string; label: string }[],
): string {
  const header = columns.map((c) => csvEscape(String(c.label))).join(",");
  const body = rows
    .map((r) =>
      columns
        .map((c) => {
          const v = r[c.key];
          if (v == null) return "";
          if (v instanceof Date) return csvEscape(v.toISOString());
          return csvEscape(String(v));
        })
        .join(","),
    )
    .join("\n");
  return body.length ? `${header}\n${body}\n` : `${header}\n`;
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}