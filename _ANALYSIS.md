# Hybrid — Full Analysis (2026-06-25)

## ১. পরিচিতি
- **Repo:** `hasanjunait2023/Hybrid` (private)
- **VPS:** Hostinger `72.62.228.196` (root, SSH alias `hostinger`)
- **Domain:** `hybrid.ecomex.cloud` (apex marketing) + `*.hybrid.ecomex.cloud` (tenant storefronts)
- **Tagline:** "Shopify for Bangladesh" — Bengali-first, mobile-first multi-tenant commerce SaaS
- **Phase:** Phase 1 + Phase 2 (M3) complete; live on self-hosted Supabase VPS

## ২. Tech Stack (LOCKED — do not debate)
- **Frontend:** Next.js (App Router), TypeScript strict, Tailwind + shadcn/ui
- **Monorepo:** Turborepo + pnpm workspaces (v10.33.2)
- **DB:** Self-hosted Supabase Postgres 15 + RLS via `app.current_tenant_id`
- **DB access:** `postgres.js` + `withTenant()` / `asPlatformAdmin()` (NEVER raw `sql`)
- **Auth:** Supabase GoTrue (production) + app opaque `hybrid_session` cookie
- **Storage:** Supabase MinIO (`BLOB_DRIVER=s3`) → `cdn.hybrid.ecomex.cloud`
- **Cache:** local Redis (`hybrid-redis`)
- **Async jobs:** FastAPI service (`hybrid-jobs` on :8000)
- **Reverse proxy:** Caddy (auto-TLS via on-demand)
- **Payments:** bKash, Nagad, SSLCommerz, COD
- **Couriers:** Steadfast (P1), Pathao/RedX/Paperfly (P2+)

## ৩. Live VPS State (verified at 2026-06-25)
| Container | Status | Port |
|---|---|---|
| hybrid-web | Up 12 min | 3000 |
| hybrid-caddy | Up 6 hours | 80, 443 |
| hybrid-postgres | Up 8 hours (healthy) | 5432 |
| hybrid-redis | Up 32 hours (healthy) | 6379 |
| hybrid-jobs | Up 20 hours | 8000 |
| supabase-db | Up 22 hours (healthy) | 5432 |
| supabase-auth (GoTrue) | Up 22 hours (healthy) | — |
| supabase-kong | Up 22 hours (healthy) | 8000-8004 |
| supabase-rest | Up 22 hours | 3000 |
| supabase-storage | Up 22 hours (healthy) | 5000 |
| supabase-minio | Up 22 hours (healthy) | 9000-9001 |
| supabase-studio | Up 22 hours (healthy) | 3000 |
| imgproxy | Up 22 hours (healthy) | 8080 |
| supabase-meta | Up 22 hours (UNHEALTHY ⚠️) | 8080 |

⚠️ `supabase-meta` unhealthy — needs check.

## ৪. Repo Structure
```
/ (root) — pnpm + turbo + docker-compose.prod.yml + 16 docs (~2,554 lines)
├── apps/
│   ├── web/         Next.js (storefront + admin + platform + marketing) — 9 API routes
│   └── api/         FastAPI service (couriers, schemas)
├── packages/
│   ├── db/          Postgres client + withTenant() (268 lines TS) + 16 SQL files (1,676 lines)
│   ├── couriers/    steadfast, pathao, redx, paperfly + statusMap
│   ├── payments/    bkash, nagad, sslcommerz, cod
│   ├── ui/          shadcn-style components + globals.css
│   └── config/      eslint (no-raw-sql rule), tailwind, tsconfig
├── infra/
│   ├── backup/
│   ├── cloudflare/
│   └── pgbouncer/
└── docs/            16 design docs (PRD, ARCHITECTURE, DEPLOY, INFRA_SUPABASE, etc.)
```

## ৫. Database Schema (33 tables in 01_schema.sql + 15 migrations)
**Core entities:** plan, app_user, tenant, tenant_member, tenant_domain, theme, tenant_theme_settings, store_page, navigation_menu, landing_page, collection, product, product_image, product_variant, product_collection, customer, customer_address, discount, order_counter, orders, order_item, payment_account, payment, courier_account, cod_remittance, shipment, subscription, invoice, usage_counter, analytics_event, audit_log, webhook_event

**Migrations applied (sequential):**
- 00_roles, 01_schema, 02_policies, 03_seed, 04_grant_login
- 06_own_auth, 07_phase2, 08_perf_indexes
- 09_returns, 10_fraud, 11_marketing, 12_reviews, 13_loyalty
- 14_platform_team, 15_platform_finance

## ৬. The Golden Rule
```ts
// CORRECT — RLS forced
import { withTenant } from "@hybrid/db";
await withTenant(tenantId, userId, (tx) => tx`select * from product`);

// FORBIDDEN — bypasses RLS; ESLint blocks
import { sql } from "@hybrid/db/client";
```
Enforced by `packages/config/eslint/no-raw-sql.mjs` (build-breaking).

## ৭. What is BUILT (per CHANGELOG.md & git log)
**Recent commits (last 20):** Storefront i18n (BN/EN), platform panel i18n, admin i18n (products, orders, settings), StatusBadge, P1-B2 accounting/finance, P1-B1 team/RBAC, P1-A4 plans/limits, P1-A3 billing UI, P1-A2 tenant 360, P1-A1 platform dashboard, on-demand TLS, security fixes (owner demotion block).

**Routes present:**
- **Marketing:** `/signup` (provisionTenant)
- **Admin (per-tenant):** /admin/products, /customers, /collections, /discounts, /orders, /reports, /returns, /reviews, /marketing, /settings, /themes, /cod
- **Platform (super-admin):** /platform/{tenants, billing, finance, plans, team}
- **Storefront (per-tenant):** _sites/[tenant]/{products, cart, checkout, order/[orderNumber]}
- **API:** /api/auth/{login, logout, otp, signup}, /api/bkash/callback, /api/admin/upload, /api/internal/{billing-sweep, courier-sync, tls-allow}

## ৮. Deployment Architecture
1. Caddy (`:80, :443`) → `hybrid-web:3000` (Next.js) + `cdn.*` → `supabase-minio`
2. `hybrid-web` ↔ `hybrid-postgres` (5432) + `hybrid-redis` (6379)
3. `hybrid-web` ↔ `supabase-kong:8000` (Supabase GoTrue) + `supabase-db:5432` (Postgres)
4. `hybrid-jobs` (FastAPI `:8000`) handles courier sync, billing sweep
5. On-demand TLS: ask-gate `web:3000/api/internal/tls-allow` blocks LE-exhaustion attacks
6. Self-hosted Supabase = full backend (db/auth/storage/studio)

## ৯. Decisions Locked
- No Vercel. No Upstash. No "own-auth replaces Supabase".
- Bengali-first UI (Noto Sans Bengali) + ৳ currency + bKash/Nagad/Rocket + +880 phone
- Mobile-first (acceptance criteria)
- RLS = sacred (build-breaking ESLint)
- No mocks in shipping code; no plaintext secrets

## ১০. Risks / Things to Watch
1. ⚠️ `supabase-meta` unhealthy — minor; meta is for Studio admin only
2. ⚠️ VPS is 8 GB box — Supabase trimmed (dropped analytics/logflare/vector/realtime/edge-functions/supavisor). Watch memory.
3. ⚠️ `hybrid-jobs` runs as separate container — verify it's pinned to same network as supabasenet
4. ⚠️ No automatic DB backup verified — `infra/backup/` exists but need to check cron
5. ⚠️ `hybrid-postgres` (5432 inside) is separate from `supabase-db` (the real Hybrid DB) — they share data via GoTrue only