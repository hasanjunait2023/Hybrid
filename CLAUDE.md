# Hybrid — CLAUDE.md

This is the canonical context file for every Claude session working on this repository.
Read this before touching any file.

---

## What is Hybrid

Hybrid is a Bengali-first, mobile-first multi-tenant commerce SaaS — "Shopify for Bangladesh."
Each seller gets an admin backend, a live themed storefront on a subdomain (later a custom domain),
and native integration with bKash/Nagad/COD and Bangladesh's courier network (Steadfast, Pathao,
RedX, Paperfly). Hard tenant isolation is enforced at the database layer via Postgres RLS.

Current status: Phase 1 complete (sellable MVP). Phase 2 (custom domains, theme catalog) is next.

---

## LOCKED stack — do not debate, do not deviate

| Concern | Decision |
|---|---|
| Framework | Next.js (App Router), TypeScript strict, latest stable |
| Monorepo | Turborepo + pnpm workspaces |
| DB | Supabase Postgres + RLS via `app.current_tenant_id` session variable |
| Runtime DB access | `postgres.js` + `withTenant()` / `asPlatformAdmin()` — never raw `sql` or the Supabase client for tenant data |
| Hosting | Vercel for Platforms (wildcard subdomains + custom domains + auto-SSL) |
| Cache | Upstash Redis (host→tenant lookup, sessions) |
| Async / heavy jobs | FastAPI service + queue (courier sync, reconciliation) |
| Payments | bKash, Nagad, SSLCommerz, COD |
| Couriers | Steadfast (Phase 1), Pathao / RedX / Paperfly (Phase 2+) |
| Styling | Tailwind + shadcn/ui (tokens defined in `packages/ui/src/globals.css`) |

---

## The Golden Rule — THE most important thing

**All tenant data access goes through `withTenant()` as the `app_runtime_login` role. Never the raw `sql` client. Never the Supabase client for tenant data.**

```ts
// CORRECT
import { withTenant } from "@hybrid/db";
const products = await withTenant(tenantId, userId, (tx) =>
  tx`select * from product`
);

// FORBIDDEN — bypasses RLS; ESLint will block this
import { sql } from "@hybrid/db/client";       // banned by no-raw-sql rule
import postgres from "postgres";               // banned by no-raw-sql rule
```

The `no-raw-sql` ESLint rule in `packages/config/eslint/no-raw-sql.mjs` enforces this in all consumer packages. It is a build-breaking error. Do not disable it.

**Why this matters:** `sql` connects as `postgres` (superuser) and bypasses RLS entirely. A single
raw query leaks every tenant's data cross-tenant. `withTenant` connects as `app_runtime_login`
(non-superuser, inherits `app_runtime` grants) and sets `app.current_tenant_id` as a
transaction-local GUC before your query runs — RLS policies use this to filter rows per-tenant.

### Two-role split (the NOLOGIN-defect fix)

The canonical `02_policies.sql` declares `app_runtime` as a `NOLOGIN` group role (it holds
grants). A `NOLOGIN` role cannot open a connection. The fix is two bookend files:

- `00_roles.sql` (runs first): creates `app_runtime_login LOGIN PASSWORD 'app_runtime_local_pw' INHERIT`
- `04_grant_login.sql` (runs last): `GRANT app_runtime TO app_runtime_login`

`DATABASE_URL` → `app_runtime_login` (RLS forced)
`DIRECT_URL`   → `postgres` superuser (migrations, seed, type gen, host lookup)

---

## Guardrails (non-negotiable)

1. **No stubs, no fakes, no TODO-left-behind.** Every task wired end-to-end against real DB/services. If it cannot be finished, flag it — do not fake it.
2. **No mock data in shipping code.** Seed data lives only in `packages/db/sql/03_seed.sql` and clearly-labelled dev seeders.
3. **RLS is sacred.** Tenant isolation never bypassed at runtime. All tenant data goes through `withTenant()`. Migrations and seed use `DIRECT_URL` (superuser).
4. **Secrets never plaintext.** Gateway/courier credentials are encrypted at the app layer (`APP_ENCRYPTION_KEY`). No keys in code, logs, or chat.
5. **Every task has a verification step.** Done only when verification passes.
6. **Mobile-first + Bengali-first are acceptance criteria**, not afterthoughts.
7. **Per-task DoD** (from `docs/BUILD_CHECKLIST.md`):
   - Implemented against real DB/services (no stub/mock in shipping code)
   - Tenant-safe (via `withTenant()`; RLS respected)
   - Tested/verified (stated verification passes)
   - Errors handled (no silent failures; user-facing errors friendly + Bengali)
   - Reviewed (no TODOs, no unguarded access, no plaintext secrets)

---

## Repo map

```
/ (repo root)
├── package.json            pnpm workspace root; turbo scripts
├── turbo.json              pipeline: build, dev, lint, typecheck, test, db:*
├── docker-compose.yml      postgres:16-alpine + redis:7-alpine (alt to embedded-postgres)
├── .env.example            every required env var with local defaults
├── tsconfig.base.json      strict, bundler resolution, @hybrid/* path aliases
├── apps/
│   ├── web/                Next.js App Router — storefront + admin + platform + marketing
│   │   ├── middleware.ts   host → tenant rewrite (node.js runtime)
│   │   ├── app/
│   │   │   ├── (marketing)/           lvh.me root — Bengali landing + /signup → provisionTenant
│   │   │   ├── (platform)/platform/   super-admin (app.lvh.me → /platform): tenant directory, suspend/reactivate
│   │   │   ├── (admin)/admin/         tenant admin (admin.lvh.me → /admin)
│   │   │   │   ├── products/          full CRUD + variants + image upload
│   │   │   │   ├── orders/            list, detail, manual entry, print, send-to-courier
│   │   │   │   ├── customers/         list, detail, notes
│   │   │   │   ├── collections/       product collections
│   │   │   │   ├── cod/               COD collection list
│   │   │   │   └── settings/          store profile, payments (bKash/COD), courier (Steadfast)
│   │   │   ├── _sites/[tenant]/       storefront (store-a.lvh.me → /_sites/store-a)
│   │   │   │   ├── products/[slug]/   product detail + AddToCart island
│   │   │   │   ├── cart/              cart island (client component)
│   │   │   │   ├── checkout/          COD + bKash checkout, location pickers
│   │   │   │   └── order/[number]/    order lookup / confirmation
│   │   │   ├── api/
│   │   │   │   ├── bkash/callback/    bKash server-side execute + amount verify + replay guard
│   │   │   │   ├── internal/billing-sweep/  CRON_SECRET gated — billing state machine runner
│   │   │   │   ├── internal/courier-sync/   CRON_SECRET gated — Steadfast status polling
│   │   │   │   └── admin/upload/      image upload (mime/size/filename sanitized)
│   │   │   ├── dev-login/             HMAC-signed dev session cookie (dev only, prod-gated)
│   │   │   └── store-not-found/       branded 404 for unknown/suspended hosts
│   │   └── lib/
│   │       ├── auth/
│   │       │   ├── session.ts         getSession() — dev-login default; own-auth seam (AUTH_PROVIDER=password)
│   │       │   └── provision.ts       provisionTenant() — asPlatformAdmin atomic new-tenant insert
│   │       ├── billing/
│   │       │   ├── status.ts          evaluateTenantBilling() — trialing→past_due→suspended (pure)
│   │       │   └── sweep.ts           billing sweep runner (reads/writes via asPlatformAdmin)
│   │       ├── commerce/
│   │       │   ├── placeOrder.ts      THE idempotent checkout txn — customer+inventory+order+payment
│   │       │   └── customer.ts        upsertCustomerByPhone()
│   │       ├── couriers/
│   │       │   ├── send.ts            sendToCourier() — openCreds + SteadfastProvider.createConsignment
│   │       │   ├── steadfast.ts       Steadfast adapter (app-layer thin wrapper over @hybrid/couriers)
│   │       │   └── sync.ts            courierSync() — polls status + updates order
│   │       ├── payments/
│   │       │   ├── bkash.ts           BkashProvider factory (resolves tenant creds + callbackURL)
│   │       │   ├── callback.ts        handleBkashCallback() — execute + amount verify + replay guard
│   │       │   └── json.ts            toJsonRecord() helper (SealedSecret → JSONValue)
│   │       ├── platform/
│   │       │   ├── auth.ts            platform admin session guard + impersonation
│   │       │   ├── cache.ts           invalidateDomainCache() — Redis flush on suspend/domain change
│   │       │   └── data.ts            listTenants(), suspendTenant(), reactivateTenant()
│   │       ├── sms/
│   │       │   ├── index.ts           SmsAdapter — sms.net.bd (SMS_LIVE gated)
│   │       │   ├── notify.ts          notifyOrderPlaced() — Bengali template, post-commit, non-blocking
│   │       │   └── templates.ts       Bengali SMS templates
│   │       ├── admin/                 catalog.ts, orders.ts, customers.ts, dashboard.ts, cod.ts, settings.ts
│   │       ├── location/              re-export bangladesh-location-data (divisions/districts/upazilas)
│   │       ├── storage/               BlobStore interface — LocalBlobStore (Phase 1); SupabaseBlobStore (Phase 2)
│   │       ├── tenant/resolve.ts      resolveTenantByHost() — Redis TTL 1h → DB fallback
│   │       ├── redis/client.ts        ioredis client (REDIS_URL)
│   │       ├── ratelimit.ts           Upstash rate limiting (signup + checkout)
│   │       └── storefront/data.ts     getStorefrontProducts(), getTenantContextBySlug() (unstable_cache)
│   └── api/                FastAPI stub — empty, Phase 2+
└── packages/
    ├── db/    @hybrid/db
    │   ├── sql/
    │   │   ├── 00_roles.sql        app_runtime_login LOGIN role (runs first)
    │   │   ├── 01_schema.sql       full schema (canonical, do not edit)
    │   │   ├── 02_policies.sql     RLS policies (canonical, do not edit)
    │   │   ├── 03_seed.sql         dev seed: 2 tenants, 6 products, 4 plans
    │   │   ├── 04_grant_login.sql  GRANT app_runtime TO app_runtime_login (runs last)
    │   │   └── 05_auth.sql         on_auth_user_created trigger (Supabase Auth path)
    │   ├── src/
    │   │   ├── client.ts           INTERNAL — sql (app_runtime_login) + adminSql (postgres)
    │   │   ├── withTenant.ts       THE contract — exported as the only tenant data path
    │   │   ├── crypto.ts           AES-256-GCM credential sealing (sealCredentials/openCredentials)
    │   │   ├── migrate.ts          db:migrate (00,01,02,04,05) and db:seed (03)
    │   │   ├── types.ts            kysely-codegen output (regenerate with pnpm db:gen)
    │   │   └── index.ts            public exports: withTenant, asPlatformAdmin, adminSql, crypto, types
    │   └── test/
    │       ├── global-setup.ts     boots embedded-postgres (NO Docker needed); writes .pgtmp.json
    │       ├── setup.ts            per-worker: reads .pgtmp.json → sets env before client.ts imports
    │       ├── rls.test.ts         RLS isolation gate (5 tests)
    │       ├── crypto.test.ts      AES-256-GCM round-trip + tamper + wrong-key (8 tests)
    │       ├── commerce.test.ts    atomic inventory decrement, oversell, server-side pricing
    │       ├── checkout.test.ts    COD + bKash checkout txn, idempotency, replay guard
    │       ├── payment-verify.test.ts  bKash amount verification (paisa-exact, mismatch→failed)
    │       ├── provision.test.ts   provisionTenant, slug uniqueness, trial subscription
    │       ├── resolve.test.ts     tenant liveness (trial serves, suspended returns null)
    │       ├── admin.test.ts       low-stock aggregation, order cancel guard on paid orders
    │       ├── billing.test.ts     trialing→past_due→suspended state machine
    │       └── courier-wire.test.ts  consignment creation, status sync, COD collection
    ├── payments/  @hybrid/payments     (Phase 1 — pure, no Next/DB)
    │   └── src/
    │       ├── bkash/provider.ts   BkashProvider — Tokenized Checkout (grant→create→execute→query)
    │       ├── bkash/codes.ts      bKash status code mapping (0000/Completed → success)
    │       ├── bkash/tokenStore.ts token cache interface (Redis bkash:token:{tenant})
    │       ├── cod/provider.ts     CodProvider — instant confirm, no-op execute/query
    │       ├── types.ts            PaymentProvider, PaymentState, PaymentResult interfaces
    │       └── index.ts            public exports
    ├── couriers/  @hybrid/couriers     (Phase 1 — pure, no Next/DB)
    │   └── src/
    │       ├── steadfast.ts        SteadfastProvider — create consignment, get status, get balance
    │       ├── statusMap.ts        Steadfast status → internal status mapping
    │       ├── types.ts            CourierAdapter, ConsignmentInput, StatusResult interfaces
    │       └── index.ts            public exports
    ├── ui/    @hybrid/ui
    │   └── src/
    │       ├── globals.css         all design tokens (CSS custom properties)
    │       ├── lib/safeUrl.ts      URL scheme guard (blocks javascript: and other non-http/https)
    │       └── components/
    │           ├── storefront/     StoreHeader, Hero, ProductCard, ProductGrid, TrustBand, etc.
    │           ├── StatusBadge.tsx order/payment/courier status chips
    │           ├── StatusStepper.tsx order progress stepper
    │           └── Button, Badge, icons
    └── config/ @hybrid/config
        ├── eslint/
        │   ├── no-raw-sql.mjs      CRITICAL: bans postgres + @hybrid/db/client imports outside packages/db
        │   ├── base.mjs
        │   └── next.mjs
        ├── tsconfig/               base.json, nextjs.json, library.json
        └── tailwind/preset.mjs
```

---

## How to run and test locally

### Prerequisites

- Node.js >= 20
- pnpm >= 10 (`npm install -g pnpm`)
- No Docker required for the RLS gate (embedded-postgres handles it)
- Docker is optional for the full dev server (alt: run `pnpm db:migrate` against a local Postgres)

### Step 1 — Environment

```bash
cp .env.example .env.local
```

The defaults in `.env.example` work out of the box for local development. They point to
`postgres://app_runtime_login:app_runtime_local_pw@localhost:5432/hybrid` (runtime) and
`postgres://postgres:postgres@localhost:5432/hybrid` (superuser). If you are using Docker,
these match the `docker-compose.yml` service exactly.

### Step 2 — Install dependencies

```bash
pnpm install
```

### Step 3 — Database (two options)

**Option A — Docker (recommended for full dev server):**

```bash
docker compose up -d
```

SQL files in `packages/db/sql/` are auto-applied on first boot in lexical order
(00 → 01 → 02 → 03 → 04). The `docker-compose.yml` mounts them as
`/docker-entrypoint-initdb.d`. No manual migration step needed after the first boot.

**Option B — No Docker (just run the RLS tests):**

Skip this step entirely. The test harness (`test/global-setup.ts`) boots its own ephemeral
embedded-postgres cluster on a random free port, applies the SQL, and tears down after the suite.

### Step 4 — Run the full test suite (no Docker needed)

```bash
pnpm --filter @hybrid/db test
```

This runs 63 tests across 10 test files against a real embedded-postgres (zero system deps).
All 63 must be green. This is the required CI gate on every PR.

Test files included: `rls.test.ts` (5), `crypto.test.ts` (8), `commerce.test.ts`,
`checkout.test.ts`, `payment-verify.test.ts`, `provision.test.ts`, `resolve.test.ts`,
`admin.test.ts`, `billing.test.ts`, `courier-wire.test.ts`.

The original 5-test RLS gate is still part of the suite (rls.test.ts). The full 63-test run
supersedes it as the Phase 1 CI gate.

### Step 5 — Generate TypeScript types (after schema changes)

```bash
pnpm db:gen
```

Requires `DIRECT_URL` pointing at a live Postgres. Run this after any schema change and commit
the updated `packages/db/src/types.ts`.

### Step 6 — Start the dev server

```bash
pnpm dev
```

Starts Next.js on port 3000. `*.lvh.me` resolves to `127.0.0.1` in all browsers — no
`/etc/hosts` edits needed.

**Test URLs (dev seed):**

| URL | What it renders |
|---|---|
| `lvh.me:3000` | Bengali marketing landing + signup |
| `lvh.me:3000/signup` | New tenant signup → provisionTenant → live trial subdomain |
| `store-a.lvh.me:3000` | Tenant A storefront (indigo accent) |
| `store-a.lvh.me:3000/products/{slug}` | Product detail page |
| `store-a.lvh.me:3000/cart` | Cart island |
| `store-a.lvh.me:3000/checkout` | COD + bKash checkout with Bangladesh location pickers |
| `store-a.lvh.me:3000/order/{number}` | Order lookup / confirmation |
| `store-b.lvh.me:3000` | Tenant B storefront (distinct accent — visual proof of isolation) |
| `admin.lvh.me:3000/dev-login?as=owner-a` | Sets HMAC-signed dev session cookie for owner-a |
| `admin.lvh.me:3000/admin/products` | Tenant A admin product list |
| `admin.lvh.me:3000/admin/orders` | Order list |
| `admin.lvh.me:3000/admin/orders/new` | Manual order entry |
| `admin.lvh.me:3000/admin/customers` | Customer list |
| `admin.lvh.me:3000/admin/cod` | COD collection list |
| `admin.lvh.me:3000/admin/settings` | Store profile, payment gateway, courier settings |
| `admin.lvh.me:3000/dev-login?as=owner-b` | Switch to owner-b session |
| `app.lvh.me:3000/dev-login?as=admin` | Platform super-admin session |
| `app.lvh.me:3000/platform` | Tenant directory (suspend/reactivate/impersonate) |
| `nope.lvh.me:3000` | Branded "store not found" page |

**Admin edit → storefront update loop:**
1. Visit `admin.lvh.me:3000/dev-login?as=owner-a`, then `/admin/products`
2. Edit a product title or price and save
3. The Server Action calls `revalidateTag(\`tenant:{id}:products\`)` — next request to the storefront shows the change

---

## Cache-tag scheme

`unstable_cache` in `lib/storefront/data.ts` uses these tags for per-tenant invalidation:

| Tag | Invalidated by |
|---|---|
| `tenant:{id}` | Any edit to the tenant's data |
| `tenant:{id}:products` | Product list/add/edit/delete |
| `tenant:{id}:product:{pid}` | Individual product edit |
| `tenant:{id}:collections` | Collection create/edit/delete |
| `tenant:{id}:orders` | Order create (incl. manual) / status change |
| `tenant:{id}:order:{oid}` | Individual order mutation |
| `tenant:{id}:customers` | Customer note/tags edit; new order (counters) |
| `tenant:{id}:dashboard` | Dashboard metrics; order/product mutations |
| `tenant:{id}:cod` | COD collection list (status change on delivery) |
| `tenant:{id}:theme` | Theme settings update |
| `tenant:{id}:page:{slug}` | Store page edit |
| `tenant:{id}:navigation` | Nav change |
| `tenant-slug:{slug}` | Slug cache (slug → id resolution) |

The admin Server Action calls `revalidateTag` with the appropriate tag(s) after any mutation.
On Vercel multi-instance, switch to Upstash cache handler (Phase 1 seam — the cache is isolated
to `lib/storefront/data.ts`, so the handler swap is one file change).

---

## Auth seam

`apps/web/lib/auth/session.ts` exports `getSession(): Promise<Session | null>`.

**Default (dev-login):** HMAC-signed dev cookie (`hybrid_dev_session`). Set by
`/dev-login?as=owner-a|owner-b|admin`. The cookie is `{userId}.{hmac-sha256}`. Constant-time
compare prevents timing oracles. `DEV_SESSION_SECRET` must be set. **Production-gated** —
returns null immediately when `NODE_ENV === 'production'`.

**Password branch (Phase 2, production default):** Set `AUTH_PROVIDER=password` for own auth
— Argon2id hashing (`@node-rs/argon2`) and opaque DB session tokens (`user_session`, SHA-256
of the cookie token). `SESSION_SECRET` (32+ bytes) signs/derives the token and
`SESSION_MAX_AGE_SECONDS` (default 604800) sets the lifetime; both fail-fast if unset in
production. Callers are unchanged — the seam is intentional. Supabase is dropped in Phase 2:
`AUTH_PROVIDER=supabase`, `@supabase/ssr`, the `SUPABASE_*` env vars, and `05_auth.sql` are
removed.

---

## Design system

See `docs/DESIGN.md` for the full spec. Key decisions for every UI task:

- Brand direction: "Bazaar Modern" — warm, confident, trustworthy, Bengali-first
- Primary color: Indigo `#1D4ED8` (trust, CTAs)
- Accent: Marigold `#F59E0B` (sale tags, warmth)
- COD green: `#047857` (dedicated trust signal — always visible on storefronts)
- Font: Hind Siliguri (self-hosted, subset to Bengali + Latin); Noto Sans Bengali fallback
- Numerals: Bangla digits on storefront (customer-facing); Latin digits in admin (operator-facing)
- Light mode only for Phase 0/1 (dark mode reads as lower-trust for COD commerce in BD)
- Storefront theme: "Doreja" (দরজা = doorway) — 2-col mobile grid, sticky bottom action bar, no carousels
- Tap targets ≥ 44px everywhere mobile. Mobile dialogs = bottom sheets.

---

## Known issues / tech debt (non-blocking, logged at GATE 2)

0. **`pnpm approve-builds` on fresh install** — On a clean machine, pnpm may prompt to approve
   the `@embedded-postgres/windows-x64` (or linux/darwin) native binary build. The
   `package.json` `pnpm.onlyBuiltDependencies` field pre-approves it, so `pnpm install` should
   proceed without a prompt. If you see the prompt anyway, run `pnpm approve-builds` and select
   the `@embedded-postgres/*` entry for your platform, then rerun `pnpm install`.

1. **Windows EBUSY teardown flake** — On Windows, `vitest` `globalSetup` teardown may fail with
   `EBUSY: resource busy or locked` when removing the embedded-postgres data directory
   (`.pgtmp`). The 63 tests still run and pass; only the exit code may flip to non-zero on
   Windows. Linux/macOS (CI) is unaffected. If you see a teardown EBUSY error, rerun —
   the test results themselves are valid.

2. **ioredis `Unhandled error event` log spam** — Under a sustained Redis outage, the ioredis
   client emits noise to the console. The resolve layer already falls through to the DB safely;
   adding `.on('error', () => {})` on the client silences it. Tracked for Phase 2.

3. **`unstable_cache` multi-instance caveat** — On Vercel, `unstable_cache` is per-instance
   (file-system). Add the Upstash cache handler before deploying to production (Phase 2 task).

4. **Bangla numerals in test output** — The Windows embedded-postgres harness uses WIN1252
   encoding; Bangla characters cannot be stored in test data. Bangla render works correctly on
   UTF-8 Postgres (Docker, Linux CI, Supabase). Verify on UTF-8 before any Bangla-text DB field.

5. **Live-deferred integrations** — bKash production, Steadfast live, SMS live, and Supabase
   Auth are fully implemented but gated behind founder-obtained credentials / environment flags.
   See CHANGELOG Phase 1 "Known issues / deferred" for details.

---

## Roadmap context

```
Phase 0 (DONE) — multi-tenant spine: withTenant RLS layer, host middleware, Doreja storefront, admin→ISR loop
Phase 1 (DONE) — sellable MVP: products CRUD, orders, COD + bKash(sandbox) checkout, Steadfast courier, SMS, billing, super-admin, signup
Phase 2 (next)  — custom domains, theme catalog, visual customizer, COD reconciliation, own auth + S3 blob driver (Supabase dropped)
Phase 3         — funnel builder, self-serve bKash billing, plan limits
Phase 4         — full section editor, multi-step funnels, scale hardening
```

Open Phase-1→2 decisions:
- Own auth in Phase 2 replaces Supabase Auth (`AUTH_PROVIDER=password`; set `SESSION_SECRET`); S3-compatible blob store (`BLOB_DRIVER=s3`, R2 recommended)
- bKash production credential onboarding (~2–4 week merchant process)
- Steadfast merchant account (no sandbox; live after account)
- SMS sender-ID masking approval (sms.net.bd, 6–7 days)
- Root domain: `myhybrid.com` (placeholder; swap in `NEXT_PUBLIC_ROOT_DOMAIN`)

Source documents: `docs/PRD.md`, `docs/BUILD_CHECKLIST.md`, `docs/architecture/phase0-blueprint.md`,
`docs/architecture/phase1-blueprint.md`, `docs/DESIGN.md`, `docs/research/phase0-brief.md`,
`docs/research/phase1-brief.md`, `.claude/team/DECISIONS.md`.
