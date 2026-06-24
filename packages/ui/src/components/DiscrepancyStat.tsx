// DiscrepancyStat — the loud summary tile for the COD settlements band
// (DESIGN §Q3.1). The headline a seller glances at every morning: does the
// courier owe me money? Mono-tnum, large, colored by tone:
//   matched (delta 0)      -> cod green + "✓ সব মিলেছে"
//   unresolved-but-small   -> warning
//   net-negative / missing -> danger (loud)
// Color + icon + text together (§7.4). Optionally tappable to filter the table.
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

interface DiscrepancyStatProps {
  label: string;
  /** Discrepancy total in taka. 0 => matched/calm. */
  amount: number;
  /** Count of unresolved discrepancy rows (drives warning vs danger). */
  discrepancyCount?: number;
  /** When set, the tile renders as a button (filter the table to discrepancies). */
  onActivateHref?: string;
  lang?: "bn" | "en";
  className?: string;
}

function grouped(n: number): string {
  return Math.abs(n)
    .toFixed(Number.isInteger(n) ? 0 : 2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function DiscrepancyStat({
  label,
  amount,
  discrepancyCount = 0,
  onActivateHref,
  lang = "bn",
  className,
}: DiscrepancyStatProps) {
  const matched = amount === 0 && discrepancyCount === 0;
  const tone = matched
    ? { box: "border-cod/30 bg-cod-weak", value: "text-cod" }
    : amount > 0 || discrepancyCount > 0
      ? { box: "border-danger/30 bg-danger-weak", value: "text-danger" }
      : { box: "border-warning/30 bg-warning-weak", value: "text-warning" };

  const display = matched
    ? lang === "bn"
      ? "✓ সব মিলেছে"
      : "✓ All matched"
    : `৳${grouped(amount)}`;

  const inner: ReactNode = (
    <div className={cn("rounded-lg border p-3", tone.box, className)}>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className={cn("mt-1 font-mono text-2xl font-bold tnum", tone.value)}>{display}</p>
      {!matched && discrepancyCount > 0 && (
        <p className="mt-0.5 text-2xs text-ink-muted">
          {discrepancyCount} {lang === "bn" ? "টি গরমিল" : "discrepancies"}
        </p>
      )}
    </div>
  );

  if (onActivateHref && !matched) {
    return (
      <a href={onActivateHref} className="block transition-shadow hover:shadow-sm">
        {inner}
      </a>
    );
  }
  return inner;
}
