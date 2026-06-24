"use client";

// ToggleSwitch — the single enable/disable switch (DESIGN §Q1/§Q4/§Q6/§P6).
// Promotes the raw inline <input type=checkbox> each provider form hand-rolled
// into one 44px-target, focus-ringed, labelled switch. Accent defaults to
// `primary`; the bKash row passes `bkash` for its pink (the only admin pink).
import { cn } from "../lib/cn";

type Accent = "primary" | "bkash";

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible label; also rendered as the on/off text unless `hideLabel`. */
  label: string;
  onLabel?: string;
  offLabel?: string;
  accent?: Accent;
  disabled?: boolean;
};

const TRACK_ON: Record<Accent, string> = {
  primary: "bg-primary",
  bkash: "bg-bkash",
};

export function ToggleSwitch({
  checked,
  onChange,
  label,
  onLabel = "চালু",
  offLabel = "বন্ধ",
  accent = "primary",
  disabled = false,
}: Props) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          // 44px hit target via padding; visual track is smaller and centered.
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          checked ? TRACK_ON[accent] : "bg-border-strong",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 rounded-full bg-surface shadow-sm transition-transform",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
      <span className="text-sm font-medium text-ink">{checked ? onLabel : offLabel}</span>
    </label>
  );
}
