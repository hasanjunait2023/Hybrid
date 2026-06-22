# Hybrid Storefront — Build Checklist (A → Z)

> Companion to: `PRD.md`, `01_schema.sql`, `02_policies.sql`. Execution playbook.
> Work top-to-bottom, phase-by-phase. Do not start a phase until the previous phase's Definition of Done (DoD) fully passes.

## 0. Ground Rules

### 0.1 Guardrails (non-negotiable)
- No stubs, no fakes, no TODO-left-behind. Every task wired end-to-end against real DB/services. If it can't be finished, flag it — don't fake it.
- No mock data in shipping code. Seed data lives only in `03_seed.sql` and clearly-labelled dev seeders.
- Every task has a verification step. Done only when verification passes.
- RLS is sacred. Tenant isolation never bypassed in runtime. All tenant data goes through `withTenant()`.
- Secrets never plaintext. Gateway/courier creds encrypted at app layer (or Supabase Vault). No keys in code, logs, or chat.
- Adversarial review pass after each phase (JUDGE): hunt stubs, missing error handling, unguarded tenant access, untested paths.
- Mobile-first + Bengali-first are acceptance criteria, not afterthoughts.

### 0.2 Tech decisions — LOCKED
| Concern | Decision |
|---|---|
| Framework | Next.js (App Router), TypeScript, latest stable |
| Hosting / domains | Vercel for Platforms (wildcard subdomains + custom domains + auto-SSL) |
| DB | Supabase Postgres + RLS via `app.current_tenant_id` session variable |
| DB access at runtime | Server-side query layer (postgres.js) with `withTenant()` transaction wrapper setting the GUCs. NOT PostgREST/Supabase-client for tenant data |
| Cache | Upstash Redis (tenant/host lookup, sessions) |
| Async/heavy jobs | FastAPI service + queue (courier sync, reconciliation, exports) |
| Payments | bKash, Nagad, SSLCommerz, COD |
| Couriers | Steadfast, Pathao, RedX, Paperfly |
| Styling | Tailwind + shadcn/ui |
| Monorepo | Turborepo |

### 0.3 Confirm before Phase 1
- Phase-1 first courier: Steadfast vs Pathao (pick ONE).
- bKash product tier for (a) storefront checkout and (b) SaaS billing.
- Product/brand name: **Hybrid** (confirmed).
- Apex domain + subdomain root for tenant stores.

### 0.4 Project context files
- `CLAUDE.md` — overview, LOCKED stack, guardrails, repo map, run/test, golden rule: all tenant data via `withTenant()`.
- `README.md` — setup + local dev.
- `.env.example` — every required env var.

---

## PHASE 0 — Foundation / Infra Spine
*Goal: prove "admin edit → storefront update" + hard tenant isolation works end-to-end with one hardcoded theme.*

### 0.1 Repo & tooling
- Init Turborepo. Layout:
  ```
  apps/
    web/   # Next.js: storefront + admin + platform + marketing (route groups)
    api/   # FastAPI (courier sync, reconciliation, webhooks workers)
  packages/
    db/        # SQL, migrations, withTenant() layer, generated types
    ui/        # shared components (shadcn)
    payments/  # bkash/nagad/sslcommerz/cod adapters
    couriers/  # steadfast/pathao/redx/paperfly adapters
    config/    # eslint/tsconfig/tailwind presets
  ```
- TS strict, ESLint, Prettier, lint-staged + Husky pre-commit.
- Commit conventions + CI scaffold (lint, typecheck, test on PR).

### 0.2 Infra accounts
- Supabase project (pooled + direct connection strings).
- Vercel for Platforms; wildcard `*.<root>` + Domains API token.
- Upstash Redis.
- DNS for apex + wildcard subdomain.

### 0.3 Env vars (.env.example)
- `DATABASE_URL` (pooled), `DIRECT_URL` (migrations)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_ROOT_DOMAIN`
- `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`
- `REDIS_URL`
- (later) bKash/Nagad/SSLCommerz/courier/SMS creds
- `APP_ENCRYPTION_KEY`

### 0.4 Database
- Apply `01_schema.sql` then `02_policies.sql` as a migration (superuser/owner connection).
- Author `03_seed.sql`: plans (free/starter/growth/pro) + 1 dev theme + 1 dev tenant + 1 dev user/membership.
- Wire migration tool; keep 01/02/03 as canonical baseline.
- Generate TS types into `packages/db`.

### 0.5 ⭐ Tenant-context DB layer (`withTenant`) — most important task
- `withTenant(tenantId, opts, fn)`: opens txn, runs `select set_config('app.current_tenant_id',$1,true)` (+ user/admin GUCs), executes fn, commit/rollback. Connects as `app_runtime` role (NOT superuser), so RLS engages.
- `asPlatformAdmin(fn)` variant sets `app.is_platform_admin='true'`.
- Forbid raw DB access outside this layer (lint rule / review gate).

### 0.6 Auth + tenant resolution
- Auth (Supabase Auth): email/phone signup + login; map identity to `app_user` + `tenant_member`.
- Session carries `user_id`; resolve active `tenant_id` and pass to `withTenant()`.

### 0.7 ⭐ Multi-tenant middleware (hostname → tenant)
- `middleware.ts`: read `host` → look up tenant by subdomain or `tenant_domain` (Redis cache) → rewrite to storefront route group with tenant in context. Browser URL unchanged.
- Route groups: apex → marketing; `app.<root>` (or `/platform`) → super-admin; `admin.<root>` (or `/admin`) → tenant admin; else → storefront.
- Unknown host → branded "store not found".

### 0.8 First render path
- One hardcoded theme renders a tenant's home + product list from DB via `withTenant()`.
- Edit product/price in minimal admin form → storefront updates next request (ISR/on-demand revalidation).

### 0.9 ⭐ RLS isolation test suite (CI gate)
- Seed tenants A & B; assert A sees only A; cross-tenant insert blocked; platform-admin override; per-tenant `order_number` sequencing.
- Wire into CI — must pass every PR.

### ✅ Phase 0 DoD
- Tenant on subdomain renders themed store from real DB.
- Admin edit reflects on storefront (no rebuild).
- RLS isolation test suite green in CI.
- `withTenant()` is the only tenant data path; no raw access.

---

## PHASE 1 — MVP Wedge (the version you sell)
*Goal: a real seller runs their business on it. One excellent theme, COD + bKash, one courier.*

1.1 Tenant Admin shell — auth-gated layout, nav, store switcher, mobile-responsive.
1.2 Products — CRUD; variants (options+price+inventory+SKU); image upload (Supabase Storage) ordered; collections; status; slug unique per tenant; atomic inventory decrement on order.
1.3 Orders — list (filters) + detail; manual order entry (Messenger/phone) — critical for F-commerce; status pipeline; printable invoice/packing slip; `order_number` shown.
1.4 Customers — auto-create/lookup by phone; list + history + addresses; notes/tags.
1.5 Dashboard — today's orders, revenue, COD pending, low-stock, recent.
1.6 Storefront (theme #1, mobile-first, Bengali default) — home, collection, product, cart, checkout, success/track, static pages; SEO+OG; "Order on Messenger/WhatsApp" fallback; fast on low-end Android/3G.
1.7 ⭐ Checkout — COD + bKash — phone-first; Division→District→Thana pickers; COD default; bKash flow + webhook; idempotent payment state machine; order+items+payment in one txn.
1.8 ⭐ Courier (the ONE chosen) — adapter: create consignment, fetch status; "Send to courier" → shipment; status sync job (FastAPI); record expected COD, COD-pending list.
1.9 Notifications (basic) — order-confirmation SMS to customer; new-order alert to seller.
1.10 Payment + store settings — enable/configure bKash + COD (encrypted creds); courier config; store profile.
1.11 Super-Admin (minimal) — tenant directory; create/suspend; assign plan; impersonate.
1.12 Marketing landing + signup — Bengali; value prop, pricing (BDT), demo link, signup → provisioning (tenant + subdomain + owner + trial sub).
1.13 Billing (manual) — manual bKash subscription record + trial/grace; suspend on non-payment.

### ✅ Phase 1 DoD
- New seller self-signs up → live subdomain store → adds products → takes COD/bKash order → ships via courier → gets paid. RLS tests green. No stubs.

---

## PHASE 2 — Domains + Themes + Customizer + COD Reconciliation
2.1 ⭐ Custom domains (Vercel) — "Connect domain" → Vercel Domains API → A/CNAME → verify → auto-SSL → primary; status polling; middleware resolves custom domains.
2.2 Theme catalog — 3–5 production themes; picker; activate (`tenant_theme_settings`).
2.3 ⭐ Visual customizer (constrained v1) — logo/colors/fonts/hero/featured; reorder/toggle fixed home sections; live preview; save → JSON; storefront renders from config.
2.4 Discounts — coupon CRUD; min-cart + usage limits; applied at checkout.
2.5 More couriers — remaining adapters behind same interface.
2.6 ⭐ COD reconciliation engine (the differentiator) — ingest remittance → `cod_remittance`; match expected→collected→remitted; `discrepancy_amount`; "COD & Settlements" view.
2.7 Analytics — internal events + GA4 + FB Pixel/CAPI; admin analytics.
2.8 Notifications (expand) — WhatsApp Cloud API.

### ✅ Phase 2 DoD
- Custom domain w/ SSL; theme picked + customized; discounts; COD reconciliation flags real discrepancy; Pixel/CAPI firing.

---

## PHASE 3 — Funnel Builder + Self-Serve Billing
3.1 Landing/Funnel pages (template-driven v1) — block-based single-product order forms; publish to `/lp/<slug>`; conversion tracking.
3.2 Self-serve billing — plans + checkout; automated bKash/Nagad recurring/top-up + grace; invoices; dunning + auto-suspend + reactivate.
3.3 Plan limits + staff — enforce limits (`usage_counter`); staff roles + permissions.

### ✅ Phase 3 DoD
- Dropshipper builds single-product funnel + takes orders; tenant self-subscribes billed via bKash; limits enforced.

---

## PHASE 4 — Depth & Scale
- Full section-based theme editor (OS 2.0 style).
- Multi-step funnels: bumps, one-click upsells, A/B testing.
- Abandoned-cart recovery; advanced analytics/cohorts.
- Integration/app framework (optional).
- Perf hardening for thousands of tenants.

---

## CROSS-CUTTING (every phase)
**Security:** all tenant data via `withTenant()` as `app_runtime`; migrations on separate privileged conn; creds encrypted; webhooks signature-verified + idempotent; no card data stored; audit admin mutations; rate-limit auth/checkout/webhooks.
**Testing:** RLS isolation suite green every PR (THE gate); unit tests for payment/courier adapters; order/checkout integration tests; E2E smoke signup→store→product→order→ship.
**Performance/Mobile:** CWV budget; storefront product/collection < 1.5s mobile; ISR + on-demand revalidation; image CDN; edge tenant/host cache.
**Bengali/i18n:** full Bengali admin + storefront; English toggle; correct Bengali typography/numerals.
**Observability:** Sentry; per-tenant structured logs; job retries w/ backoff; payment/courier failure alerts.
**Deployment/CI-CD:** Vercel (web) + host (api); preview deploys per PR; DB migrations in pipeline; rollback plan; secrets in env not repo.

## Per-Task DoD
1. Implemented against real DB/services (no stub/mock in shipping code).
2. Tenant-safe (via `withTenant()`; RLS respected).
3. Tested/verified (stated verification passes).
4. Errors handled (no silent failures; user-facing errors friendly + Bengali).
5. Reviewed (JUDGE pass: no TODOs, no unguarded access, no plaintext secrets).

### Build order
Phase 0 (isolation + render spine) → Phase 1 (sellable MVP) → Phase 2 (domains/themes/customizer/COD recon) → Phase 3 (funnels + self-serve billing) → Phase 4 (editor, upsells, scale).
> Ship Phase 1 to real paying tenants before Phase 2. Revenue first, depth second.
