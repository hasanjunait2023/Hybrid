import type { ReactNode } from "react";
import { cn } from "../lib/cn";

type Tone = "cod" | "sale" | "success" | "warning" | "danger" | "neutral";

interface BadgeProps {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}

// Status = color + text (+ caller-supplied icon), never color alone (DESIGN §7.4).
const TONE: Record<Tone, string> = {
  cod: "bg-cod-weak text-cod",
  sale: "bg-accent-weak text-accent-hover",
  success: "bg-success-weak text-success",
  warning: "bg-warning-weak text-warning",
  danger: "bg-danger-weak text-danger",
  neutral: "bg-surface-2 text-ink-muted",
};

export function Badge({ tone = "neutral", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold leading-none",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
