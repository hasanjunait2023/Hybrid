# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions track phases rather than semver until the first public release.

---

## [Hybrid Pay — unified white-label gateway] — 2026-06-29

Added **Hybrid Pay**, Hybrid's single white-labeled online payment gateway, powered
under the hood by a self-hosted [PipraPay](https://github.com/PipraPay/PipraPay)
instance (AGPL-3.0). It **subsumes the individual MFS gateways** — buyers no longer
pick "bKash"/"Nagad" as separate Hybrid options; they pick **Hybrid Pay** and choose
the method on its hosted page. Runbook: `docs/INFRA_HYBRIDPAY.md`.

- **Pure provider** `@hybrid/payments` → `HybridpayProvider` (`hybridpay/`): `create-charge`
  → hosted `pp_url`, `verify-payment` by `pp_id`, status mapping. Header `mhs-piprapay-api-key`.
  7 unit tests (create/verify/amount-coercion/failure/missing-creds).
- **Per-tenant isolation:** each tenant = a PipraPay "brand" with its own API key, stored
  sealed (AES-256-GCM) in `payment_account` (provider `hybridpay`). New enum value via
  `23_hybridpay.sql`. Money routes to the tenant's own number.
- **Money path:** `lib/payments/hybridpay.ts` factory; checkout create-charge + redirect;
  `/api/hybridpay/webhook` (GET browser-return + POST webhook) re-verifies by `pp_id`,
  paisa-exact amount match, `webhook_event` replay guard, order flip. `callback.ts`
  generalized to `processGatewayCallback(provider)` (bKash kept via a thin wrapper — existing
  bKash suite green, no regression).
- **Checkout:** storefront now shows one online option (**Hybrid Pay**, indigo) + COD; bKash
  card removed from the storefront. `placeOrder` gains `hybridpay` + an `onlineRequired` flag.
- **Tenant self-serve onboarding** (`HybridPayForm`): companion-app install guide, MFS number,
  API key, and the webhook URL to whitelist — all in `Settings → Payments`. Legacy direct
  gateways (bKash/Nagad/SSLCommerz) moved under an "advanced" disclosure, still functional.
- **Infra:** `pay.hybrid.ecomex.cloud` Caddy block + TLS allowlist; `docker compose --profile
  hybridpay` PHP+MySQL services; `HYBRIDPAY_BASE_URL` env.

## [Infra: self-hosted Supabase migration] — 2026-06-25

Migrated the **entire backend onto a self-hosted Supabase stack** on the VPS
(`hybrid.ecomex.cloud`). Reverses the earlier "Phase 2 drops Supabase" plan. Runbook:
`docs/INFRA_SUPABASE.md`.

- **Database** → self-hosted `supabase-db` (Supabase Postgres 15). Hybrid schema in
  `postgres.public` alongside the GoTrue `auth` schema. `DATABASE_URL`/`DIRECT_URL` repointed;
  RLS isolation re-verified (`app_runtime_login` non-superuser; `postgres` BYPASSRLS).
- **Auth** → Supabase **GoTrue** (`AUTH_PROVIDER=supabase`). GoTrue is the credential authority
  (users in `auth.users`, Studio-managed); login verifies there and the app mints its own opaque
  `hybrid_session`. New: `lib/auth/supabaseAuth.ts`, `supabase` branches in `getSession` +
  `/api/auth/login` + `/api/auth/signup`, a real `/login` page, `@supabase/supabase-js` dep.
- **Storage** → Supabase **MinIO** (`BLOB_DRIVER=s3`, bucket `hybrid-media`, public GetObject-only),
  served at `https://cdn.hybrid.ecomex.cloud` via Caddy. Images now survive rebuilds.
- **Stack trimmed** to fit 2 vCPU / 8 GB: dropped analytics/logflare, vector, realtime,
  edge-functions, supavisor (the heavy services that OOM-killed it before).
- **Fix**: `(admin)` and `(platform)` layouts are now `force-dynamic` — they were being statically
  prerendered into a baked auth redirect, so the runtime session was never evaluated.
- `dev-login` now funnels to `/login` (on the public host) whenever `AUTH_PROVIDER != dev`.

---

## [Phase 1] — 2026-06-23

Phase 1 goal: sellable MVP. A new seller can sign up, get a live subdomain, add products, take
a COD or bKash (sandbox) order, ship via Steadfast, and have their account status tracked.
No stubs in any shipped path.

Gates: typecheck 5/5, lint 5/5, db suite 63/63, Next.js build clean.

### Added

- **Bengali landing page + self-serve signup.** Sellers arrive at `lvh.me`, fill in store name
  and a slug, and land on a live `{slug}.myhybrid.com` trial subdomain in one atomic provision
  transaction. Duplicate slugs produce a friendly Bangla error.

- **Tenant provisioning (`lib/auth/provision.ts`).** `provisionTenant()` runs as
  `asPlatformAdmin` and atomically inserts the tenant, its subdomain, the owner membership, and
  a trialing subscription (14-day trial, starter plan) in a single transaction.

- **Products, variants, and images CRUD.** Sellers add products with multiple variants (size,
  color, SKU, price, inventory) and upload images via the admin. Images land in
  `public/uploads/{tenant}/` (local blob store; swap to Supabase Storage via `BLOB_DRIVER` in
  Phase 2). Collections are also available.

- **Orders: list, detail, manual entry, status machine, and printable invoice.** Merchants can
  create orders manually (walk-in customers) or see orders placed via the storefront. Status
  transitions are logged. Print layout renders in Bengali numerals.

- **Customers.** Auto-upserted by phone on every order (storefront or manual). Merchant can
  add notes and view order history per customer.

- **Dashboard with low-stock alerts.** Shows recent orders, revenue, and all variants at or
  below the stock threshold (5 units).

- **COD + bKash (sandbox) checkout — one idempotent `withTenant` transaction.** The storefront
  checkout form (with Bangladesh location pickers for division/district/thana) places an order
  in a single atomic transaction: customer upsert → atomic inventory decrement → order insert →
  payment record. An oversell attempt fails at the database `RETURNING` guard and rolls back
  cleanly. bKash flow opens a popup then resolves via `/api/bkash/callback` (server-verified
  payment amount, paisa-exact; replay-safe via `webhook_event` unique constraint). COD orders
  are confirmed immediately. SMS notification sent post-commit (log-mode until `SMS_LIVE=1`).

- **Storefront: product detail page, cart, order lookup.** Customers can browse a product
  detail page, add to cart (client-side island), proceed to checkout, and look up their order
  by number after placing it.

- **Tenant liveness enforcement.** Storefronts serve for `active`, `trialing`, and `past_due`
  tenants. Suspended or cancelled tenants get a 404 — no data leaks to the error page.

- **Encrypted gateway and courier credential settings (AES-256-GCM).** Sellers enter bKash
  API keys and Steadfast API credentials in the admin settings. Credentials are sealed with
  `APP_ENCRYPTION_KEY` before storage and masked on read — the raw secret is never logged or
  rendered.

- **Send to courier (Steadfast) + courier sync.** Merchants tap "Send to Steadfast" on an
  order; the adapter creates a consignment and stores the tracking code. The cron endpoint
  `/api/internal/courier-sync` (authenticated via `CRON_SECRET`) polls status and updates orders.

- **COD collection list.** Admin view of orders with outstanding cash-on-delivery — what the
  courier owes the merchant.

- **Platform super-admin.** `app.lvh.me/platform` lists all tenants with status, plan, and
  trial info. Platform admins can suspend or reactivate a tenant and impersonate an owner for
  support (dev-login compatible, production-gated).

- **Billing state machine + billing sweep.** Subscriptions transition: trialing → past_due
  (after 14-day trial) → suspended (after 3-day grace period). The `/api/internal/billing-sweep`
  cron endpoint (authenticated via `CRON_SECRET`) drives the transitions and suspends tenants.
  Manual billing record is the Phase 1 model — no live SaaS charge yet.

- **`@hybrid/payments` package.** Pure (no Next/DB imports; fetch injectable). `BkashProvider`
  implements the Tokenized Checkout flow (grant → create → execute → query); `CodProvider`
  is a no-op confirming immediately. Payment state machine: pending → success / failed /
  cancelled / refunded.

- **`@hybrid/couriers` package.** Pure. `SteadfastProvider` wraps the Steadfast v1 API
  (create consignment, get status, get balance). Status mapped to internal states. No sandbox
  exists for Steadfast — live dispatch is deferred until a merchant account is available.

- **`@hybrid/db` crypto (`packages/db/src/crypto.ts`).** AES-256-GCM credential sealing used
  by payment and courier settings. `APP_ENCRYPTION_KEY` is required at startup (fail-fast, no
  insecure fallback). `SealedSecret` envelope stored as JSONB.

- **Supabase Auth provider seam.** `getSession()` in `lib/auth/session.ts` gains a Supabase
  branch (activated by `AUTH_PROVIDER=supabase`). Local dev continues to use the HMAC dev-login
  path. `packages/db/sql/05_auth.sql` adds the `on_auth_user_created` trigger for the Supabase
  path. The seam is dormant until a Supabase instance (Docker or cloud) is configured.

- **Rate limiting** on signup and checkout via Upstash Redis.

- **`lib/location`** re-exports `bangladesh-location-data` (divisions, districts, upazilas in
  Bangla and English) for the checkout and manual order location pickers.

- **`lib/sms`** — sms.net.bd adapter with Bengali templates. Sent after commit, non-blocking,
  caught and logged. Live send gated behind `SMS_LIVE=1`.

### Security (Phase 1 hardening, commit 031f925)

- **bKash payment amount verified server-side.** The amount returned by the bKash Execute
  response is compared paisa-exact against the order total stored at payment creation. A
  mismatch sets `payment_status = failed` and never marks the order paid. There is no client-
  controlled path to the payment amount — prices are computed server-side from DB variant records.

- **Signup account-takeover fix.** `createAppUser` uses a `xmax = 0` check to distinguish
  insert from conflict. An existing email is refused with a friendly error before any cookie is
  set. The dev-login cookie branch is now production-gated (never executes in production).

- **`javascript:` scheme blocked in store URLs.** `safeUrl()` in `@hybrid/ui` rejects any URL
  whose scheme is not `http` or `https`. Admin settings validate URLs with a Zod `https`-only
  refinement.

- **bKash callback URL derived server-side** from the verified tenant domain — not supplied by
  the client request.

- **CRON endpoints use constant-time secret comparison** (`CRON_SECRET` checked via
  `timingSafeEqual`).

- **Cancel blocked on paid orders.** Orders with a completed payment cannot be cancelled
  through the admin UI in Phase 1 (no automatic refund path; manual process required).

### Known issues / deferred (non-blocking, flagged at GATE 2)

- **bKash live sandbox round-trip** — requires `BKASH_SANDBOX=1` and real sandbox credentials.
  The adapter and tests are complete; the credentials are founder-gated (2–4 week onboarding).

- **Steadfast live consignment** — no Steadfast sandbox exists. Contract tests pass locally.
  Live dispatch requires a merchant account.

- **SMS live send** — requires an sms.net.bd account and sender-ID masking approval (6–7 days).
  All logic is in place; `SMS_LIVE` env gates the real API call.

- **Supabase Auth (cloud)** — dev-login is the default and is production-gated. Supabase
  provider activates via `AUTH_PROVIDER=supabase` once a Docker or cloud instance is available.

- **Bangla numerals in test output** — the Windows embedded-postgres harness uses WIN1252
  encoding; Bangla characters cannot be stored in test data. Bangla render is verified on
  UTF-8 Postgres (Docker / Linux CI / Supabase).

- **`unstable_cache` per-instance on Vercel** — add the Upstash cache handler before
  multi-instance production deployment (Phase 2 task).

---

## [Phase 0] — 2026-06-23

Phase 0 goal: prove "admin edit → storefront update" with hard tenant isolation against a real
database. One hardcoded theme. No stubs in any shipped path.

### Added

- **Turborepo monorepo** with pnpm workspaces: `apps/web` (Next.js), `apps/api` (FastAPI stub),
  `packages/db` (`@hybrid/db`), `packages/ui` (`@hybrid/ui`), `packages/config` (`@hybrid/config`).
  TypeScript strict throughout; `moduleResolution: bundler`; path alias `@hybrid/*`.

- **`packages/db` — `withTenant()` RLS layer.** The make-or-break tenant isolation contract.
  `withTenant(tenantId, userId, fn)` opens a `postgres.js` transaction, sets
  `app.current_tenant_id`, `app.current_user_id`, and `app.is_platform_admin` as
  transaction-local GUCs, executes the callback, and commits. A throw triggers automatic
  rollback with no GUC residue. `prepare: false` is set for pgBouncer/Supavisor compatibility.
  `asPlatformAdmin(fn)` sets the platform-admin GUC for cross-tenant reads (host lookup,
  provisioning). Neither function leaks context across pooled connections.

- **SQL bookend files to fix the NOLOGIN-defect in the canonical schema.** `00_roles.sql`
  creates `app_runtime_login` (LOGIN, inherits `app_runtime`). `04_grant_login.sql`
  (applied last) grants `app_runtime` to `app_runtime_login`. The canonical `01_schema.sql`
  and `02_policies.sql` are untouched. `DATABASE_URL` connects as `app_runtime_login`
  (non-superuser, RLS forced); `DIRECT_URL` connects as `postgres` (superuser, migrations only).

- **`03_seed.sql` with fixed UUIDs.** Four plans (free/starter/growth/pro); two dev tenants
  (store-a, store-b) on `lvh.me` subdomains; three seeded app users (owner-a, owner-b, platform
  admin); six active products (three per tenant); active theme settings per tenant with distinct
  accent colors; one published home page per tenant. `order_counter` intentionally not pre-seeded
  (the RLS gate exercises the trigger).

- **`migrate.ts`** — idempotent file-based migrations over `DIRECT_URL`. `_migrations` ledger
  prevents double-apply. `db:migrate` applies `00, 01, 02, 04`; `db:seed` applies `03`.

- **`no-raw-sql` ESLint rule** (`packages/config/eslint/no-raw-sql.mjs`). Bans direct imports
  of `postgres` or `@hybrid/db/client` in all consumer packages. A raw postgres.js connection
  bypasses RLS context; this rule makes the violation a build error.

- **`apps/web/middleware.ts` — host-to-tenant routing.** Reads the `Host` header, strips port,
  routes: root/`www` to marketing; `app.*` to super-admin (`/platform`); `admin.*` to tenant
  admin (`/admin`); any other host to `resolveTenantByHost()` then `/_sites/{slug}/*` internal
  rewrite (browser URL unchanged). Direct requests to `/_sites/` are blocked (returns
  store-not-found) to prevent tenant enumeration.

- **`lib/tenant/resolve.ts`** — Redis-backed host-to-tenant resolution. Cache key
  `domain:{host}`, TTL 1h for hits, 60s for MISS sentinel (avoids DB hammering on unknown
  hosts). Cache failures degrade gracefully to DB fallback. `invalidateDomainCache()` stub
  ready for Phase 2 domain management.

- **`_sites/[tenant]/` storefront.** Per-tenant layout loads theme settings via
  `getTenantContextBySlug()` and injects `--color-primary` / `--color-accent` CSS variables.
  Home page and product list render from `getStorefrontProducts()`, both wrapped in
  `unstable_cache` with per-tenant cache tags for on-demand ISR.

- **`(admin)/admin/` product management.** Product list (all of the tenant's active products)
  and edit form. The edit Server Action calls `withTenant()` for the update then
  `revalidateTag('tenant:{id}:products')` and `revalidateTag('tenant:{id}:product:{id}')` —
  the storefront reflects the change on the next request without a rebuild.

- **`dev-login` route and `getSession()` auth seam.** `getSession()` verifies an HMAC-SHA256-
  signed dev cookie (`hybrid_dev_session`) with constant-time compare. Disabled in production.
  `DEV_SESSION_SECRET` required at startup (fail-fast: no hardcoded fallback). The
  `getSession()` signature is the stable Phase 1 seam — Supabase Auth replaces the body,
  callers are unchanged.

- **`@hybrid/ui` Doreja theme** ("দরজা" = doorway). Storefront components: `StoreHeader`
  (dual-row sticky, COD trust strip, language toggle), `Hero` (single image/flat panel, no
  carousel), `ProductGrid` (2-col mobile, 3-col sm, 4-col lg, 5-col xl), `ProductCard`
  (image + Bangla name + price + COD chip + add-to-cart, ≤6 elements), `TrustBand`, `StoreFooter`,
  `StickyActionBar` (mobile product-page conversion anchor). Design tokens in `globals.css`:
  Indigo primary, Marigold accent, COD-green, warm-paper neutrals, Hind Siliguri font stack.

- **`packages/db/test/rls.test.ts` — the five-test RLS isolation gate.** Runs via Vitest
  against a real Postgres (no mocks). Tests: (1) tenant A sees only A's products; (2) A's
  context returns 0 rows for B's data; (3) cross-tenant INSERT rejected by `WITH CHECK`;
  (4) `asPlatformAdmin` sees both tenants; (5) `order_number` sequences independently per
  tenant (A: 1, B: 1, A: 2). This gate is the required CI check on every PR.

- **Embedded-postgres test harness** (`test/global-setup.ts`). Boots an ephemeral Postgres 16
  cluster on a random free port via `embedded-postgres` (npm), applies all five SQL files as
  superuser, writes connection strings to `.pgtmp.json` for worker pickup, and tears down after
  the suite. No Docker and no system Postgres required.

- **`docker-compose.yml`** — `postgres:16-alpine` + `redis:7-alpine`. SQL files auto-applied
  on first boot via `/docker-entrypoint-initdb.d`. Optional alternative to embedded-postgres
  for developers who prefer Docker for the full dev server.

- **kysely-codegen type generation** (`db:gen`). Introspects `DIRECT_URL` and emits row types
  to `packages/db/src/types.ts`. CI runs gen + `git diff --exit-code` to catch schema drift.

- **Turbo pipeline**: `build` (with `^build` dependency), `dev` (persistent, no cache), `lint`,
  `typecheck`, `test` (no cache), `db:migrate`, `db:seed`, `db:gen`.

- **`docs/` documentation set**: `PRD.md`, `BUILD_CHECKLIST.md`, `DESIGN.md`,
  `architecture/phase0-blueprint.md`, `research/phase0-brief.md`.

### Security

- HMAC-SHA256 dev session cookie with constant-time compare. `DEV_SESSION_SECRET` is required
  at startup; missing secret throws immediately rather than silently using a guessable literal.
  Cookie verification returns `null` in production (`NODE_ENV === 'production'`).

- RLS is enforced at the database layer, not the application layer. A bug in application code
  that omits a tenant filter does not leak data — Postgres rejects the query. The only escape
  hatch is `asPlatformAdmin()`, which requires an explicit call at the application layer.

- Middleware fails closed: an unknown host (tenant not found, unverified domain, or inactive
  tenant) routes to `store-not-found`, never to another tenant's data.

- `/_sites/*` paths arriving in the request URL (not injected by the server rewrite) are
  blocked at middleware before any routing, preventing direct tenant enumeration.

- `APP_ENCRYPTION_KEY` env var is present in `.env.example` for gateway/courier credential
  encryption (Phase 1). No credentials are stored in this phase.

### Known issues (non-blocking, tracked)

- On Windows, `vitest` teardown may emit an `EBUSY` error when removing the embedded-postgres
  data directory after the test suite. The five tests pass; only the exit code may flip. CI
  (Linux) is unaffected.
- `ioredis` emits `Unhandled error event` log noise under a sustained Redis outage. The resolve
  layer already degrades gracefully. An `.on('error')` handler will silence it in Phase 1.
- `unstable_cache` is per-instance on Vercel. Upstash cache handler required before production
  multi-instance deployment (Phase 1 task).
