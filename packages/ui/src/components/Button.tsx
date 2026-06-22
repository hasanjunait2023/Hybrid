import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

type Variant = "primary" | "secondary" | "accent" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  children: ReactNode;
}

// DESIGN §7.2 — no gradients, weight 600, 44px min tap target on mobile,
// designed hover/active states, visible focus ring inherited from globals.
const VARIANT: Record<Variant, string> = {
  primary:
    "bg-primary text-ink-on-primary shadow-xs hover:bg-primary-hover hover:shadow-sm active:bg-primary-active active:translate-y-px",
  secondary:
    "bg-surface text-ink border border-border-strong hover:bg-surface-2 active:translate-y-px",
  accent: "bg-accent text-ink shadow-xs hover:bg-accent-hover active:translate-y-px",
  ghost: "bg-transparent text-primary hover:bg-primary-weak",
  danger:
    "bg-danger text-ink-on-primary shadow-xs hover:opacity-90 active:translate-y-px",
};

const SIZE: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-base", // 44px — mobile tap target floor
  lg: "h-12 px-6 text-lg",
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-semibold",
        "transition-[background-color,box-shadow,transform] duration-fast ease-out-soft",
        "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-subtle disabled:shadow-none disabled:translate-y-0",
        VARIANT[variant],
        SIZE[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
