# Ecomex Storefront — Claude Code Build Checklist (A → Z)

> Companion to: `Ecomex_Storefront_PRD.md`, `01_schema.sql`, `02_policies.sql`.
> This is the execution playbook. Claude Code works **top-to-bottom, phase-by-phase**. Do **not** start a phase until the previous phase's **Definition of Done (DoD)** fully passes.

---

## 0. Ground Rules (read before writing any code)

### 0.1 Guardrails (non-negotiable)
- [ ] **No stubs, no fakes, no TODO-left-behind.** Every task is wired end-to-end against the real DB/services. If something can't be finished, it's not "done" — flag it, don't fake it.
- [ ] **No mock data in shipping code.** Seed data lives only in `03_seed.sql` and clearly-labelled dev seeders.
- [ ] **Every task has a verification step.** A task is done only when its verification passes (test, script, or manual check noted in the task).
- [ ] **RLS is sacred.** Tenant isolation must never be bypassed in runtime code paths. Any code that touches tenant data goes through the `withTenant()` layer (§ Phase 0).
- [ ] **Secrets are never plaintext.** Gateway/courier credentials encrypted at app layer (or Supabase Vault). No keys in code, logs, or chat.
- [ ] **Adversarial review pass.** After each phase, run a self-review (JUDGE pass): hunt for stubs, missing error handling, unguarded tenant access, and untested paths before declaring DoD.
- [ ] **Mobile-first + Bengali-first** are acceptance criteria, not afterthoughts.

### 0.2 Tech decisions — LOCKED (do not re-litigate)
| Concern | Decision |
|---|---|
| Framework | Next.js (App Router), TypeScript, latest stable |
| Hosting / domains | Vercel for Platforms (wildcard subdomains + custom domains + auto-SSL) |
| DB | Supabase Postgres + **RLS via `app.current_tenant_id` session variable** (per `02_policies.sql`) |
| DB access at runtime | Server-side query layer (postgres.js / node-postgres) with a `withTenant()` transaction wrapper that sets the GUCs. **Not** PostgREST/Supabase-client for tenant data (our RLS is session-var based, not JWT-claim based). |
| Cache | Upstash Redis (tenant/host lookup, sessions) |
| Async/heavy jobs | FastAPI service + queue (courier sync, reconciliation, exports); or Modal for batch |
| Payments | bKash, Nagad, SSLCommerz, COD |
| Couriers | Steadfast, Pathao, RedX, Paperfly |
| Styling | Tailwind + a component lib (shadcn/ui) |
| Monorepo | Turborepo |

### 0.3 Decisions to CONFIRM with Junait before coding Phase 1
- [ ] Phase-1 first courier: **Steadfast vs Pathao** (pick ONE).
- [ ] bKash product tier for (a) storefront checkout and (b) SaaS billing.
- [ ] Product/brand name (keep "Ecomex" or new consumer brand).
- [ ] Apex domain (`myecomex.com`?) and subdomain root for tenant stores.

### 0.4 Project context files to create first
- [ ] `CLAUDE.md` — project overview, the LOCKED stack, the guardrails above, repo map, "how to run/test", and the golden rule: *all tenant data access goes through `withTenant()`*.
- [ ] `README.md` — setup + local dev instructions.
- [ ] `.env.example` — every required env var (see § Phase 0.3).

---

## PHASE 0 — Foundation / Infra Spine
*Goal: prove "admin edit → storefront update" + hard tenant isolation works end-to-end with one hardcoded theme.*

### 0.1 Repo & tooling
- [ ] Init Turborepo monorepo. Proposed layout:
  ```
  apps/
    web/            # single Next.js app: storefront + admin + platform + marketing (route groups)
    api/            # FastAPI service (courier sync, reconciliation, webhooks workers)
  packages/
    db/             # SQL files, migrations, withTenant() layer, generated types
    ui/             # shared components (shadcn)
    payments/       # bkash/nagad/sslcommerz/cod adapters
    couriers/       # steadfast/pathao/redx/paperfly adapters
    config/         # eslint/tsconfig/tailwind presets
  ```
- [ ] TypeScript strict mode, ESLint, Prettier, lint-staged + Husky pre-commit.
- [ ] Commit conventions + CI scaffold (lint, typecheck, test on PR).

### 0.2 Infra accounts & provisioning
- [ ] Supabase project (Postgres). Capture connection strings (pooled + direct).
- [ ] Vercel project on **Vercel for Platforms**; enable wildcard domain `*.<root>` and get Domains API token.
- [ ] Upstash Redis instance.
- [ ] DNS for apex + wildcard subdomain configured.

### 0.3 Environment variables (`.env.example`)
- [ ] `DATABASE_URL` (pooled), `DIRECT_URL` (migrations)
- [ ] `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `NEXT_PUBLIC_ROOT_DOMAIN`
- [ ] `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`
- [ ] `REDIS_URL`
- [ ] (later) bKash / Nagad / SSLCommerz / courier / SMS gateway creds
- [ ] `APP_ENCRYPTION_KEY` (for credential encryption)

### 0.4 Database
- [ ] Apply `01_schema.sql` then `02_policies.sql` to Supabase (as a migration; superuser/owner connection).
- [ ] Author `03_seed.sql`: plans (free/starter/growth/pro) + 1 dev theme + 1 dev tenant + 1 dev user/membership for local testing.
- [ ] Wire a migration tool (Supabase migrations or drizzle-kit/sqitch) so schema changes are versioned. Keep `01/02/03` as the canonical baseline.
- [ ] Generate TypeScript types from the DB schema into `packages/db`.

### 0.5 ⭐ Tenant-context DB layer (`withTenant`) — the most important task
- [ ] Build `withTenant(tenantId, opts, fn)` in `packages/db`:
  - opens a transaction,
  - runs `select set_config('app.current_tenant_id', $1, true)` (and `app.current_user_id`, `app.is_platform_admin` when relevant),
  - executes `fn` (all queries),
  - commits/rolls back.
  - Connects as the **`app_runtime`** role (NOT a superuser/service role), so RLS engages.
- [ ] Build `asPlatformAdmin(fn)` variant that sets `app.is_platform_admin='true'`.
- [ ] Forbid raw DB access outside this layer (lint rule or code review gate).

### 0.6 Auth + tenant resolution
- [ ] Auth (Supabase Auth or chosen provider): email/phone signup + login; map identity to `app_user` + `tenant_member`.
- [ ] Session carries `user_id`; on tenant-scoped requests, resolve the active `tenant_id` and pass to `withTenant()`.

### 0.7 ⭐ Multi-tenant middleware (hostname → tenant)
- [ ] `middleware.ts`: read `host` header → look up tenant by subdomain or `tenant_domain` (cache in Redis) → internally rewrite to the storefront route group with `tenant` in context. Browser URL unchanged.
- [ ] Route-group routing: apex/root → marketing; `app.<root>` (or `/platform`) → super-admin; `admin.<root>` (or `/admin`) → tenant admin; everything else (subdomain/custom domain) → storefront.
- [ ] Unknown host → branded 404 / "store not found".

### 0.8 First render path
- [ ] One hardcoded theme renders a tenant's home + product list **from the DB** via `withTenant()`.
- [ ] Editing a product/price in a minimal admin form updates the storefront on next request (ISR/on-demand revalidation wired).

### 0.9 ⭐ RLS isolation test suite (CI gate)
- [ ] Automated tests (replicating the validated manual proof): seed tenants A & B; assert A's context sees only A's rows; assert cross-tenant insert is **blocked**; assert platform-admin override; assert per-tenant `order_number` sequencing.
- [ ] Wire these tests into CI — **they must pass on every PR**.

### ✅ Phase 0 Definition of Done
- [ ] A tenant on a subdomain renders a themed store from real DB data.
- [ ] Admin edit reflects on storefront (no rebuild).
- [ ] RLS isolation test suite green in CI.
- [ ] `withTenant()` is the only tenant data path; no raw access exists.

---

## PHASE 1 — MVP Wedge (the version you sell)
*Goal: a real seller runs their business on it. One excellent theme, COD + bKash, one courier.*

### 1.1 Tenant Admin shell
- [ ] Auth-gated admin layout, nav, store switcher (if user has multiple), mobile-responsive.

### 1.2 Products
- [ ] CRUD products; variants (options + price + inventory + SKU); image upload (Supabase Storage) with ordering; collections; status (draft/active/archived); slug uniqueness per tenant.
- [ ] Inventory decrement on order (atomic).

### 1.3 Orders
- [ ] Order list (filters: status, date) + detail view.
- [ ] **Manual order entry** (for Messenger/phone orders) — critical for F-commerce.
- [ ] Status pipeline (pending → confirmed → packed → shipped → delivered → returned/cancelled).
- [ ] Printable invoice / packing slip.
- [ ] `order_number` shown (from trigger).

### 1.4 Customers
- [ ] Auto-create/lookup by phone; customer list + order history + addresses; basic notes/tags.

### 1.5 Dashboard
- [ ] Today's orders, revenue, COD pending, low-stock, recent orders.

### 1.6 Storefront (theme #1, mobile-first, Bengali default)
- [ ] Pages: home, collection/category, product detail, cart, checkout, order-success/track, static pages.
- [ ] SEO + Open Graph (Facebook share cards). "Order on Messenger/WhatsApp" fallback button.
- [ ] Fast on low-end Android/3G (ISR/edge cache; image optimization).

### 1.7 ⭐ Checkout — COD + bKash
- [ ] Phone-first checkout; Division → District → Thana pickers; minimal fields; **COD default**.
- [ ] bKash payment flow (chosen tier) with webhook confirmation; idempotent payment state machine (use `payment` + `webhook_event` idempotency).
- [ ] Order + items + payment written in one transaction; inventory + customer counters updated.

### 1.8 ⭐ Courier integration (the ONE chosen courier)
- [ ] Adapter in `packages/couriers`: create consignment, fetch status.
- [ ] "Send to courier" action on an order → creates `shipment` (consignment_id, tracking).
- [ ] Status sync job (FastAPI worker) updates shipment + order fulfillment.
- [ ] **MVP COD tracking:** record expected COD on shipment; show COD-pending list. (Full reconciliation = Phase 2.)

### 1.9 Notifications (basic)
- [ ] Order-confirmation SMS to customer (BD SMS gateway); new-order alert to seller.

### 1.10 Payment + store settings
- [ ] Admin: enable/configure bKash + COD (`payment_account`, encrypted creds); configure courier (`courier_account`).
- [ ] Store profile (name, logo, contact, social, policies pages).

### 1.11 Super-Admin (minimal)
- [ ] Tenant directory (list/search/status); create/suspend tenant; assign plan manually; impersonate for support.

### 1.12 Marketing landing page + signup
- [ ] Public marketing site (Bengali): value prop, pricing (BDT), live demo store link, signup CTA → tenant provisioning (creates tenant + subdomain + owner membership + trial subscription).

### 1.13 Billing (manual, Phase 1)
- [ ] Manual bKash subscription record + trial/grace handling; suspend storefront on non-payment.

### ✅ Phase 1 Definition of Done
- [ ] A new seller self-signs up, gets a live subdomain store, adds products, takes a COD/bKash order, ships via the courier, and gets paid.
- [ ] You can onboard a paying tenant. RLS tests still green. No stubs in any shipped path.

---

## PHASE 2 — Domains + Themes + Customizer + COD Reconciliation

### 2.1 ⭐ Custom domains (Vercel for Platforms)
- [ ] Admin "Connect domain" flow: add `tenant_domain` → call Vercel Domains API → show A/CNAME records → verify → auto-SSL → set primary.
- [ ] Domain status polling + states (`pending/issued/failed`); middleware resolves custom domains.

### 2.2 Theme catalog + system
- [ ] 3–5 production-quality themes (fashion, cosmetics, electronics, general, single-product) registered with section components + JSON settings schema.
- [ ] Theme picker in admin; activate theme (`tenant_theme_settings`).

### 2.3 ⭐ Visual customizer (constrained, v1)
- [ ] Settings panel: logo, colors, fonts, hero, featured collections; reorder/toggle a fixed set of home sections; **live preview**; save → JSON config; storefront renders from config.

### 2.4 Discounts
- [ ] Coupon CRUD (%, fixed, free-shipping), min-cart + usage limits; applied at checkout.

### 2.5 More couriers
- [ ] Add remaining courier adapters (Pathao/RedX/Paperfly) behind the same interface.

### 2.6 ⭐ COD reconciliation engine (the differentiator)
- [ ] Ingest courier remittance reports → `cod_remittance`; match shipment expected COD ↔ collected ↔ remitted; compute `discrepancy_amount`; set `cod_status`/`reconciled`.
- [ ] Admin "COD & Settlements" view: pending payout, delayed, discrepancies flagged. This is the sticky, money-saving screen — make it excellent.

### 2.7 Analytics
- [ ] Internal events (`analytics_event`) + GA4 + **Facebook Pixel + Conversions API**; admin analytics (sales over time, top products, conversion funnel, traffic sources).

### 2.8 Notifications (expand)
- [ ] WhatsApp Cloud API order updates; shipped/delivered notifications.

### ✅ Phase 2 DoD
- [ ] Tenant connects a custom domain with working SSL; picks + customizes a theme; runs discounts; COD reconciliation flags a real discrepancy correctly; Pixel/CAPI firing.

---

## PHASE 3 — Funnel Builder + Self-Serve Billing

### 3.1 Landing/Funnel pages (CartFlows-style, template-driven v1)
- [ ] Block-based single-product order-form pages (`landing_page.blocks`): hero, product, benefits, social proof, countdown, embedded order form (COD/bKash), FAQ, sticky CTA.
- [ ] Publish to `/lp/<slug>` or a mapped domain; conversion tracking.

### 3.2 Self-serve subscription billing
- [ ] Plans + checkout; **automated bKash/Nagad recurring or top-up + grace**; invoices (`invoice`); dunning + auto-suspend on non-payment + reactivate.

### 3.3 Plan limits + staff
- [ ] Enforce plan limits (products, orders/month via `usage_counter`, custom domains, staff seats).
- [ ] Staff roles (owner/admin/staff) + permissions in admin.

### ✅ Phase 3 DoD
- [ ] A dropshipper builds a single-product funnel and takes orders; a tenant self-subscribes and is billed via bKash automatically; plan limits enforced.

---

## PHASE 4 — Depth & Scale

- [ ] Full **section-based theme editor** (Online Store 2.0 style): add/remove/reorder sections per page with live preview.
- [ ] Multi-step funnels: order bumps, one-click upsells, **A/B testing**.
- [ ] Abandoned-cart recovery; advanced analytics/cohorts.
- [ ] Integration/app framework (optional).
- [ ] Performance hardening for thousands of tenants (edge caching, query tuning, connection pooling limits, read replicas if needed).

### ✅ Phase 4 DoD
- [ ] Editor handles arbitrary section layouts; funnels run upsells + A/B; platform stays fast at scale targets.

---

## CROSS-CUTTING CHECKLISTS (apply every phase)

### A. Security
- [ ] All tenant data via `withTenant()`; runtime connects as `app_runtime` (RLS on).
- [ ] Migrations/jobs run on a separate privileged connection, never serving user requests.
- [ ] Credentials encrypted (`APP_ENCRYPTION_KEY`/Vault); never logged.
- [ ] Webhooks signature-verified + idempotent (`webhook_event` unique).
- [ ] Card data never stored (gateways handle PCI).
- [ ] Audit admin mutations (`audit_log`).
- [ ] Rate-limit auth + checkout + webhooks.

### B. Testing
- [ ] RLS isolation suite (Phase 0) green on every PR — **the gate**.
- [ ] Unit tests for payment/courier adapters (mock provider responses).
- [ ] Order/checkout integration tests (idempotency, inventory, totals).
- [ ] E2E smoke: signup → store → product → order → ship.

### C. Performance / Mobile
- [ ] Core Web Vitals budget; storefront product/collection < 1.5s on mobile.
- [ ] ISR + on-demand revalidation on content changes; image CDN; edge tenant/host cache.

### D. Bengali / i18n
- [ ] Full Bengali admin + storefront; English toggle; correct Bengali typography/numerals where appropriate.

### E. Observability
- [ ] Error tracking (Sentry), per-tenant structured logs, job retries with backoff, payment/courier failure alerts.

### F. Deployment / CI-CD
- [ ] Vercel deploy (web) + host (api); preview deploys per PR; DB migrations in pipeline; rollback plan; secrets in Vercel/Supabase env (not in repo).

---

## Per-Task "Definition of Done" template (apply to every checkbox)
1. **Implemented** against real DB/services (no stub, no mock in shipping code).
2. **Tenant-safe** (goes through `withTenant()`; RLS respected).
3. **Tested/verified** (the task's stated verification passes).
4. **Errors handled** (no silent failures; user-facing errors are friendly + Bengali).
5. **Reviewed** (JUDGE pass: no leftover TODOs, no unguarded access, no plaintext secrets).

---

### Build order summary (one line)
**Phase 0** (isolation + multi-tenant render spine) → **Phase 1** (sellable MVP: products/orders/COD+bKash/1 courier) → **Phase 2** (custom domains, themes, customizer, COD reconciliation) → **Phase 3** (funnels + self-serve bKash billing) → **Phase 4** (full editor, upsells, scale).

> Reminder: ship Phase 1 to **real paying tenants** before starting Phase 2. Revenue first, depth second.
