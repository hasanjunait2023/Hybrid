// Shared admin UI primitives — the dashboard's visual language, reused across
// every admin surface so list pages echo the dashboard: a consistent page
// header (title + optional subtitle + right-aligned action) and the summary
// StatCard strip. Server components (no client state). Hybrid indigo brand,
// Latin numerals / tabular-nums (admin §4.4).
import Link from "next/link";
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
    <div className="flex flex-wrap items-end justify-between gap-3">
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

// Breadcrumb trail for deep admin pages (order detail, customer detail,
// settings sub-pages). Each item is {label, href?}. The last item renders
// as plain text (current page). Renders nothing if only 1 item.
export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (!items || items.length <= 1) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-ink-muted">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1">
              {c.href && !last ? (
                <Link
                  href={c.href}
                  className="inline-flex min-h-[44px] items-center rounded px-2 hover:bg-surface-2 hover:text-ink"
                >
                  {c.label}
                </Link>
              ) : (
                <span className="px-1 py-0.5 text-ink" aria-current={last ? "page" : undefined}>
                  {c.label}
                </span>
              )}
              {!last && (
                <span aria-hidden="true" className="text-ink-subtle">
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
