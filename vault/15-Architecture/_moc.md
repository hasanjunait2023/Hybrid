---
type: moc
area: architecture
generated_by: graphify
graph: 2910 nodes · 6282 edges · 210 communities
updated: 2026-06-26
---

# Architecture MOC (graph-derived)

Auto-derived from the code by `/graphify` (AST over 585 files). This is the **machine map** —
regenerate it, don't hand-edit (`/graphify . --update` after changes). Full interactive view:
`graphify-out/graph.html` (gitignored — open locally). The "why" lives in [[vault/20-Decisions/_index|ADRs]].

See [[vault/15-Architecture/how-we-use-graphify|how we use this]].

## 🪨 God nodes — the keystones (highest degree = highest blast radius)
Touching these ripples across the whole app. Plan changes here carefully; **never split them
across parallel agents** (this is what caused the i18n dict-file contention).

| node | degree | role |
|---|---|---|
| `getSession()` | 149 | auth — every gated page/action |
| `withTenant()` | 145 | **the golden rule** — tenant data path (RLS) |
| `getActiveTenantId()` | 144 | tenant resolution |
| `useDict()` | 131 | i18n (client) |
| `getDict()` | 120 | i18n (server) |
| `asPlatformAdmin()` | 96 | platform / cross-tenant path |
| `formatNumber()` | 77 | i18n numerals |
| `formatMoney()` | 66 | i18n money |
| `useLocale()` | 35 | i18n locale |
| `revalidateTag()` | 34 | cache invalidation |

> [!insight] i18n became a hub
> 4 of the top 8 god nodes are i18n (`useDict/getDict/formatNumber/formatMoney`). The bilingual
> migration wired i18n into nearly every surface — which is exactly why it was a large job and why
> any future i18n change has a wide blast radius. Treat the i18n dict as a shared keystone.

## 🧩 Module map (largest communities → directories)
| community | size | maps to |
|---|---|---|
| C0, C3, C4, C7, C9 | 79/64/64/55/41 | **admin features** — products, cod, customers, dashboard widgets, returns |
| C1 | 70 | **custom domains** (`lib/domains` — dns, vercel, state) |
| C2, C6 | 69/58 | **i18n** (`lib/i18n` dictionaries + provider) |
| C5 | 60 | **platform** (`(platform)` — finance, team, billing) |
| C8, C10 | 44/40 | **`@hybrid/ui`** components (icons, stat cards) |
| C11, C12 | 38/37 | package dependency graphs (`db`, `web`) |
| C13 | 35 | **storefront** (`_sites` — cart, checkout, location) |

## How to use
- **Before a refactor** → `/graphify path "X" "Y"` or `query` to get the blast radius; write it into the feature note Scope.
- **Onboarding** → learn the 10 god nodes first; they're the spine.
- **Agent partitioning** → split work along communities (C0…C13), keep each god node owned by one agent.
- **Drift check** → graph the VPS tree, diff vs this. Pairs with [[vault/30-Ops/git-vps-sync]].

## Regenerate
```
/graphify .            # full rebuild (AST, code-only seed)
/graphify . --update   # incremental after changes
```
This seed is **code-only** (AST). To layer in doc/decision concepts, run `/graphify docs vault` and merge.
