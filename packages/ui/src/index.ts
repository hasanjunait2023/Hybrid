// @hybrid/ui — shared storefront/admin primitives + theme tokens.
//
// Phase 0 SKELETON: placeholder export so apps/web imports resolve. The
// frontend engineer (Slice 3) fills this with shadcn primitives and storefront
// sections (hero, featured_products, product_grid, product card) driven by the
// CSS-variable token contract documented in ./globals.css and docs/DESIGN.md.

export const UI_PACKAGE = "@hybrid/ui" as const;

// Placeholder building block proving the package resolves and types flow.
export interface ThemeTokens {
  primary: string;
  accent: string;
}

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
