// Skeleton — loading placeholder block. A pulsing surface rectangle sized by the
// caller's className (w-/h-/rounded-). Used while settlement/list data loads.
import { cn } from "../lib/cn";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-surface-2", className)}
      aria-hidden="true"
    />
  );
}
