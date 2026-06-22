# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions track phases rather than semver until the first public release.

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
