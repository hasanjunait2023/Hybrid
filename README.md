# Hybrid

Hybrid is a Bengali-first, mobile-first multi-tenant commerce SaaS — a "Shopify for Bangladesh."
Each Bangladeshi seller gets an admin backend, a live themed storefront on a `*.myhybrid.com`
subdomain (or a custom domain), and native support for bKash/Nagad/COD payments, Bangladesh
courier dispatch (Steadfast/Pathao/RedX/Paperfly), and a landing/funnel builder — all in Bangla,
all optimized for cheap Android on 3G, all with Cash-on-Delivery as first class.

**Current status: Phase 1 complete.** The sellable MVP is built and verified: new sellers can
sign up, add products, and take real COD and bKash (sandbox) orders through a live storefront.
The db test suite runs 63 tests (RLS isolation, checkout idempotency, billing state machine,
crypto, courier wiring, and more) — all green. Admin, super-admin, billing sweep, and courier
dispatch are all wired against a real database with no stubs in any shipped path.

---

## Quick start

### Prerequisites

- Node.js >= 20
- pnpm >= 10 (`npm install -g pnpm`)
- No Docker needed to run the RLS gate. Docker optional for the full dev server.

### 1. Clone and install

```bash
git clone <repo-url> hybrid
cd hybrid
pnpm install
```

`pnpm install` downloads the `embedded-postgres` native binary for your platform as part of
the install. The `package.json` `pnpm.onlyBuiltDependencies` field pre-approves this download
so no interactive prompt is required.

### 2. Set up environment

```bash
cp .env.example .env.local
```

The defaults in `.env.example` target the local Docker Compose Postgres and Redis. No edits
required for the RLS gate or the dev server when using Docker.

### 3. Run the full test suite (no Docker required)

```bash
pnpm --filter @hybrid/db test
```

This is the Phase 1 definition-of-done gate. It boots an ephemeral embedded-postgres cluster
(no Docker, no system Postgres needed), applies all SQL files in order, runs 63 tests across
10 test files, and tears down. Expected output: `63 passed`.

Test files and what they cover:

| File | Tests | What it proves |
|---|---|---|
| `rls.test.ts` | 5 | RLS isolation — cross-tenant reads and writes blocked |
| `crypto.test.ts` | 8 | AES-256-GCM seal/open, GCM tamper detection, wrong-key rejection |
| `commerce.test.ts` | ~8 | Atomic inventory decrement, oversell prevention, server-side pricing |
| `checkout.test.ts` | ~8 | COD + bKash checkout transaction, idempotency, replay guard |
| `payment-verify.test.ts` | ~6 | bKash amount verification (paisa-exact, mismatch→failed) |
| `provision.test.ts` | ~6 | Tenant provisioning, slug uniqueness, trial subscription |
| `resolve.test.ts` | ~4 | Tenant liveness: trial serves, suspended returns null |
| `admin.test.ts` | ~8 | Low-stock aggregation, order cancel guard on paid orders |
| `billing.test.ts` | ~6 | trialing → past_due → suspended state machine |
| `courier-wire.test.ts` | ~4 | Consignment creation, status sync, COD collection |

### 4. Start the dev server (Docker required for this step)

```bash
docker compose up -d   # boots postgres:16-alpine + redis:7-alpine; SQL auto-applied on first boot
pnpm dev               # Next.js on :3000
```

`*.lvh.me` resolves to `127.0.0.1` in all browsers — no `/etc/hosts` edits needed.

### 5. Visit the test stores and admin

| URL | Description |
|---|---|
| `lvh.me:3000` | Bengali marketing landing + signup |
| `lvh.me:3000/signup` | Create a new tenant (provisions a live trial subdomain) |
| `store-a.lvh.me:3000` | Tenant A storefront (Doreja theme, indigo accent) |
| `store-a.lvh.me:3000/products/{slug}` | Product detail page |
| `store-a.lvh.me:3000/cart` | Cart island |
| `store-a.lvh.me:3000/checkout` | COD + bKash checkout with Bangladesh location picker |
| `store-a.lvh.me:3000/order/{number}` | Order lookup / confirmation |
| `store-b.lvh.me:3000` | Tenant B storefront (distinct accent — visual isolation proof) |
| `admin.lvh.me:3000/dev-login?as=owner-a` | Sign in as tenant A owner (HMAC dev cookie) |
| `admin.lvh.me:3000/admin/products` | Product list + new product |
| `admin.lvh.me:3000/admin/orders` | Order list |
| `admin.lvh.me:3000/admin/orders/new` | Manual order entry |
| `admin.lvh.me:3000/admin/customers` | Customer list |
| `admin.lvh.me:3000/admin/cod` | COD collection list |
| `admin.lvh.me:3000/admin/settings` | Store profile, payment settings, courier settings |
| `app.lvh.me:3000/dev-login?as=admin` | Sign in as platform super-admin |
| `app.lvh.me:3000/platform` | Tenant directory (suspend/reactivate/impersonate) |
| `nope.lvh.me:3000` | "Store not found" page |

To test the full seller flow on dev seed:
1. `admin.lvh.me:3000/dev-login?as=owner-a` — sign in
2. `/admin/products/new` — add a product with a variant and price
3. Refresh `store-a.lvh.me:3000` — product appears on the storefront
4. Add to cart → checkout with COD → order appears in `/admin/orders`

---

## Local-first note

Phase 1 is deliberately local-first. You do not need any cloud accounts to develop and test:

- **Full test suite (63 tests)**: uses `embedded-postgres` (npm package) — zero system dependencies, runs on any machine
- **Dev server**: uses `docker-compose.yml` (postgres:16-alpine + redis:7-alpine)
- **Cloud env vars** (`SUPABASE_URL`, `VERCEL_API_TOKEN`, etc.) are stubbed empty in `.env.example`
  and are not used until cloud deployment (Phase 2+)
- **bKash sandbox** (`BKASH_SANDBOX=1`) and **Steadfast live** require founder-obtained credentials (see CHANGELOG for details)
- **SMS live send** is gated behind `SMS_LIVE=1` — log-mode is the default

---

## Project structure

```
apps/
  web/          Next.js App Router (storefront + admin + platform + marketing)
  api/          FastAPI stub (courier sync, reconciliation — Phase 2+)
packages/
  db/           @hybrid/db — postgres.js client, withTenant RLS layer, SQL, crypto, types
  payments/     @hybrid/payments — BkashProvider (Tokenized Checkout) + CodProvider (pure, no Next/DB)
  couriers/     @hybrid/couriers — SteadfastProvider courier adapter (pure, no Next/DB)
  ui/           @hybrid/ui — shadcn primitives + Doreja storefront components
  config/       @hybrid/config — ESLint (incl. no-raw-sql rule), tsconfig, Tailwind preset
```

Key files:
- `packages/db/src/withTenant.ts` — the RLS transaction wrapper; the only legal path to tenant data
- `packages/db/src/crypto.ts` — AES-256-GCM credential sealing (`APP_ENCRYPTION_KEY`)
- `packages/db/test/rls.test.ts` — RLS isolation gate (5 tests; part of the 63-test suite)
- `apps/web/middleware.ts` — host to tenant rewrite
- `apps/web/lib/commerce/placeOrder.ts` — idempotent checkout transaction (COD + bKash)
- `apps/web/lib/auth/provision.ts` — new-tenant provisioning (signup → live subdomain)
- `apps/web/lib/billing/status.ts` — billing state machine (trialing → past_due → suspended)
- `apps/web/lib/storefront/data.ts` — `unstable_cache` per-tenant queries

If the Docker DB already exists and you need to apply migrations manually:

```bash
pnpm --filter @hybrid/db db:migrate   # applies 00_roles, 01_schema, 02_policies, 04_grant_login
pnpm --filter @hybrid/db db:seed      # applies 03_seed (2 dev tenants, 6 products, 4 plans)
pnpm --filter @hybrid/db db:gen       # regenerates packages/db/src/types.ts from live schema
```

---

## Troubleshooting

**EBUSY teardown error on Windows after `pnpm --filter @hybrid/db test`:**
The 63 tests pass; only the teardown step (deleting the embedded-postgres data directory)
may fail with `EBUSY` on Windows. The test results are valid. Simply rerun or ignore the
non-zero exit code in local development. CI (Linux) is unaffected.

If the error repeats across runs, an orphan embedded-postgres process may be holding the
data directory. Kill it with:
```
taskkill /F /IM postgres.exe 2>nul; taskkill /F /IM initdb.exe 2>nul
```
Then rerun. The data directory is in the repo at `packages/db/.pgtmp` — you can also
delete it manually between runs.

**`APP_ENCRYPTION_KEY` is invalid on startup:**
The key in `.env.example` is a valid 32-byte base64 key for local dev. If you generated
your own, ensure it is exactly 32 decoded bytes: `openssl rand -base64 32` produces the
right format.

**Billing sweep or courier sync returns 401:**
These endpoints require `CRON_SECRET` to be set. For local testing, add
`CRON_SECRET=dev-cron-secret` to `.env.local` and pass the same value as a
`Authorization: Bearer dev-cron-secret` header.

**`DEV_SESSION_SECRET is not set` error:**
Ensure `.env.local` exists and was copied from `.env.example`. The file must contain
`DEV_SESSION_SECRET=dev-only-change-me` (or any non-empty string for local dev).

**Redis connection refused on `pnpm dev`:**
The dev server needs Redis for host to tenant caching. Start Docker first: `docker compose up -d`.
The resolve layer degrades gracefully (falls through to the DB) but will log a connection error.

**`pnpm db:gen` fails:**
`db:gen` introspects a live Postgres via `DIRECT_URL`. Run `docker compose up -d` first,
then `pnpm db:gen`.

---

## Docs

- `CLAUDE.md` — full context for Claude sessions (stack, golden rule, repo map, commands)
- `docs/PRD.md` — product requirements
- `docs/BUILD_CHECKLIST.md` — phase-by-phase execution playbook + DoD
- `docs/architecture/phase0-blueprint.md` — approved Phase 0 architecture
- `docs/architecture/phase1-blueprint.md` — approved Phase 1 architecture (packages, slices, sacred invariants)
- `docs/DESIGN.md` — "Bazaar Modern" design system (tokens, Bangla typography, Doreja theme)
- `docs/ARCHITECTURE.md` — concise architecture reference
- `CHANGELOG.md` — version history
