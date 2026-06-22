// Minimal className joiner. The codebase has no clsx/tailwind-merge dependency
// and the design system avoids conditional-class explosions, so a zero-dep
// filter+join is sufficient. Falsy values are dropped.
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
