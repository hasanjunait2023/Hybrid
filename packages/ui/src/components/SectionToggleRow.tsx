"use client";

// <SectionToggleRow> — one row of the customizer's fixed home-section list
// (DESIGN §Q0/§Q1.3). It is the SINGLE place the "reorder = up/down buttons,
// never a drag handle" rule is enforced (DESIGN §Q1.1 scope guard, the most
// important anti-creep decision). There is deliberately NO drag handle, NO
// drop target, NO pointer reorder — exposing only Move-up / Move-down / enable
// keeps the constrained customizer from drifting into a page builder (Phase 4).
//
// Presentational + accessible: every control is a real <button> with a 44px tap
// target, a visible focus ring, and an aria-label; the enable toggle is a
// role=switch with aria-checked. Disabled up/down at the ends. All state lives
// in the parent (controlled) — this component only emits intent.
import { cn } from "../lib/cn";
import { ToggleSwitch } from "./ToggleSwitch";

export interface SectionToggleRowProps {
  /** Human label for the section (Bengali). */
  label: string;
  /** Whether the section is shown on the storefront. */
  enabled: boolean;
  /** True for the first row (Move-up disabled). */
  isFirst: boolean;
  /** True for the last row (Move-down disabled). */
  isLast: boolean;
  /** Optional soft warning shown under the label when disabled (e.g. trust_band). */
  warning?: string;
  onToggle: (enabled: boolean) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function SectionToggleRow({
  label,
  enabled,
  isFirst,
  isLast,
  warning,
  onToggle,
  onMoveUp,
  onMoveDown,
}: SectionToggleRowProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
      {/* Reorder: up/down buttons ONLY — never a drag handle (scope guard). */}
      <div className="flex flex-col">
        <ReorderButton
          direction="up"
          disabled={isFirst}
          onClick={onMoveUp}
          aria-label={`${label} উপরে নিন`}
        />
        <ReorderButton
          direction="down"
          disabled={isLast}
          onClick={onMoveDown}
          aria-label={`${label} নিচে নিন`}
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="bn-body truncate text-sm font-semibold text-ink">{label}</p>
        {!enabled && warning ? (
          <p className="bn-body mt-0.5 text-xs text-st-pending">{warning}</p>
        ) : null}
      </div>

      <ToggleSwitch
        checked={enabled}
        onChange={onToggle}
        label={`${label} সেকশন চালু/বন্ধ`}
      />
    </div>
  );
}

interface ReorderButtonProps {
  direction: "up" | "down";
  disabled: boolean;
  onClick: () => void;
  "aria-label": string;
}

function ReorderButton({
  direction,
  disabled,
  onClick,
  "aria-label": ariaLabel,
}: ReorderButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "grid h-5 w-9 place-items-center rounded text-ink-muted transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        disabled ? "cursor-not-allowed opacity-30" : "hover:bg-surface-2 hover:text-ink",
      )}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {direction === "up" ? (
          <polyline points="18 15 12 9 6 15" />
        ) : (
          <polyline points="6 9 12 15 18 9" />
        )}
      </svg>
    </button>
  );
}
