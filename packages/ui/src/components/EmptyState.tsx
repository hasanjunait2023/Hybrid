// EmptyState — calm empty placeholder for lists/tables (DESIGN §Q3.3 + general).
// A bordered surface card with an optional icon, a title, an optional one-line
// hint, and an optional action slot. Bengali-first copy passed by the caller.
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

interface EmptyStateProps {
  title: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, hint, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border border-border bg-surface px-4 py-10 text-center",
        className,
      )}
    >
      {icon && <div className="text-ink-subtle">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="max-w-sm text-xs text-ink-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
