# Hybrid UI Kit — how to build with it

`@hybrid/ui` is the **"Bazaar Modern"** design system for Hybrid, a Bengali-first,
mobile-first commerce platform for Bangladesh. Indigo + marigold, **light mode only**,
Bengali-first. Components are React 19 function components, styled entirely through
the bundled stylesheet — there is **no theme provider to mount**.

## Setup — link one stylesheet, that's it

Link `styles.css` once at the app root. It `@import`s the design tokens, fonts, and
the compiled component styles (`_ds_bundle.css`). No `<Provider>`, no context, no
runtime theme setup — a component renders correctly as soon as that stylesheet is on
the page. Nothing breaks silently; if a component looks unstyled, the stylesheet isn't
linked.

**Tenant theming (optional):** every storefront can recolor itself by setting
`--color-primary` and `--color-accent` as an inline style on a root element
(`<html style="--color-primary:#7c3aed">`). All `*-primary` / `*-accent` utilities
track it automatically — never hardcode hex for the brand color, use the token.

## Styling idiom — Tailwind utilities mapped to tokens

Style your own layout with these utility classes (real names, all token-backed). Do
**not** invent palette hex or arbitrary spacing — compose from this vocabulary:

| Family | Classes |
|---|---|
| Brand | `bg-primary` `bg-primary-hover` `bg-primary-active` `bg-primary-weak` · `bg-accent` `bg-accent-hover` `bg-accent-weak` |
| Surfaces | `bg-bg` `bg-surface` `bg-surface-2` · `border-border` `border-border-strong` |
| Text (ink) | `text-ink` `text-ink-muted` `text-ink-subtle` `text-ink-on-primary` |
| Semantic | `text-success`/`bg-success-weak` · `text-cod`/`bg-cod-weak` (COD green) · `text-warning`/`bg-warning-weak` · `text-danger`/`bg-danger-weak` |
| Order status | `bg-st-pending-weak text-st-pending` and the same pair for `st-confirmed` `st-packed` `st-shipped` `st-delivered` `st-returned` `st-cancelled` |
| Payment | `bg-bkash text-bkash-text` `bg-bkash-weak` (bKash pink) |
| Radius | `rounded-sm` `rounded-md` `rounded-lg` `rounded-xl` `rounded-full` |
| Shadow | `shadow-xs` `shadow-sm` `shadow-md` `shadow-lg` `shadow-focus` |
| Type scale | `text-2xs` `text-xs` `text-sm` `text-base` `text-lg` `text-xl` `text-2xl` `text-3xl` `text-4xl` |
| Containers | `max-w-storefront` `max-w-admin` `max-w-marketing` · `duration-fast` `ease-out-soft` |

**Numerals matter:** storefront (customer-facing) uses **Bangla digits**; admin
(operator-facing) uses **Latin digits**. The exported helpers do this for money:
`formatBdtBangla(price)` for storefronts, `formatBdtLatin(price)` for admin. Tabular
alignment: add the `tnum` class.

## Where the truth lives

- `styles.css` — the single stylesheet entry; read it and its `@import`ed
  `_ds_bundle.css` for the full token list (every `--color-*`, `--text-*`, `--radius-*`).
- `components/<group>/<Name>/<Name>.prompt.md` — per-component usage + props.
- `components/<group>/<Name>/<Name>.d.ts` — the typed API contract.

## One idiomatic example

```tsx
import { ProductCard, Button, Badge, formatBdtBangla } from "@hybrid/ui";

export function Storefront({ products }) {
  return (
    <main className="mx-auto max-w-storefront px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">নতুন পণ্য</h1>
        <Badge tone="cod">ক্যাশ অন ডেলিভারি</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {products.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
      <div className="mt-6 rounded-lg border border-border bg-surface p-4 shadow-xs">
        <p className="text-lg font-bold text-ink tnum">{formatBdtBangla(12900)}</p>
        <Button variant="primary" size="lg" fullWidth>অর্ডার করুন</Button>
      </div>
    </main>
  );
}
```

Compose your own structure with the utilities above; reach for a library component
(Button, Badge, ProductCard, StatusBadge, …) for any real UI control.
