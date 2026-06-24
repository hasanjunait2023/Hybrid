// Shared admin UI primitives — the dashboard's visual language, reused across
// every admin surface so list pages echo the dashboard: a consistent page
// header (title + optional subtitle + right-aligned action) and the summary
// StatCard strip. Server components (no client state). Hybrid indigo brand,
// Latin numerals / tabular-nums (admin §4.4).
import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// 2-col mobile, 4-col ≥ md — same rhythm as the dashboard KPI row.
export function StatStrip({ children }: { children: ReactNode }) {
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</section>
  );
}

export type StatTone = "default" | "pending" | "warning" | "muted" | "success" | "danger" | "cod";

const VALUE_TONE: Record<StatTone, string> = {
  default: "text-ink",
  pending: "text-st-pending",
  warning: "text-warning",
  muted: "text-ink-subtle",
  success: "text-success",
  danger: "text-danger",
  cod: "text-cod",
};

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
  mono = false,
  tappable = false,
  deltaUp,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: StatTone;
  mono?: boolean;
  tappable?: boolean;
  /** When set, colors `sub` green (up) / red (down) for a delta read. */
  deltaUp?: boolean;
}) {
  const subTone =
    deltaUp === undefined ? "text-ink-subtle" : deltaUp ? "text-success" : "text-danger";
  return (
    <div
      className={`rounded-lg border border-border bg-surface p-4 shadow-xs ${tappable ? "transition-shadow hover:shadow-md" : ""}`}
    >
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold leading-none ${VALUE_TONE[tone]} ${mono ? "font-mono tnum" : "tnum"}`}>
        {value}
      </p>
      {sub && <p className={`mt-1.5 text-2xs ${subTone}`}>{sub}</p>}
    </div>
  );
}
