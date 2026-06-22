# Hybrid

Hybrid is a Bengali-first, mobile-first multi-tenant commerce SaaS — a "Shopify for Bangladesh."
Each Bangladeshi seller gets an admin backend, a live themed storefront on a `*.myhybrid.com`
subdomain (or a custom domain), and native support for bKash/Nagad/COD payments, Bangladesh
courier dispatch (Steadfast/Pathao/RedX/Paperfly), and a landing/funnel builder — all in Bangla,
all optimized for cheap Android on 3G, all with Cash-on-Delivery as first class.

**Current status: Phase 0 complete.** The multi-tenant spine is built and verified: per-tenant
storefronts render from a real database behind Postgres RLS, admin edits propagate instantly via
on-demand ISR revalidation, and the five-test RLS isolation gate is green.

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

### 3. Run the RLS isolation gate (no Docker required)

```bash
pnpm --filter @hybrid/db test
```

This is the Phase 0 definition-of-done. It boots an ephemeral embedded-postgres cluster (no
Docker, no system Postgres needed), applies all five SQL files in order, runs five isolation
tests, and tears down. Expected output: `5 passed`.

What the tests prove:
- Tenant A sees only A's data (RLS filter works)
- Tenant A cannot read B's rows (cross-tenant read blocked)
- Cross-tenant INSERT is rejected by RLS `WITH CHECK`
- `asPlatformAdmin` sees all tenants (admin override works)
- `order_number` sequences independently per tenant

### 4. Start the dev server (Docker required for this step)

```bash
docker compose up -d   # boots postgres:16-alpine + redis:7-alpine; SQL auto-applied on first boot
pnpm dev               # Next.js on :3000
```

`*.lvh.me` resolves to `127.0.0.1` in all browsers — no `/etc/hosts` edits needed.

### 5. Visit the test stores

| URL | Description |
|---|---|
| `store-a.lvh.me:3000` | Tenant A storefront (Doreja theme, indigo accent) |
| `store-b.lvh.me:3000` | Tenant B storefront (distinct accent — visual isolation proof) |
| `admin.lvh.me:3000/dev-login?as=owner-a` | Sign in as tenant A owner (HMAC dev cookie) |
| `admin.lvh.me:3000/admin/products` | Tenant A admin — product list |
| `lvh.me:3000` | Marketing site stub |
| `app.lvh.me:3000` | Platform super-admin stub |
| `nope.lvh.me:3000` | "Store not found" page |

To test the admin edit to storefront update loop:
1. `admin.lvh.me:3000/dev-login?as=owner-a` then `/admin/products`
2. Edit a product and save
3. Refresh `store-a.lvh.me:3000` — the storefront updates on the next request (on-demand ISR)

---

## Local-first note

Phase 0 is deliberately local-first. You do not need any cloud accounts to develop and test:

- **RLS gate**: uses `embedded-postgres` (npm package) — zero system dependencies, runs on any machine
- **Dev server**: uses `docker-compose.yml` (postgres:16-alpine + redis:7-alpine)
- **Cloud env vars** (`SUPABASE_URL`, `VERCEL_API_TOKEN`, etc.) are stubbed empty in `.env.example`
  and are not used until cloud deployment (Phase 1+)

---

## Project structure

```
apps/
  web/          Next.js App Router (storefront + admin + platform + marketing)
  api/          FastAPI stub (courier sync, reconciliation — Phase 1+)
packages/
  db/           @hybrid/db — postgres.js client, withTenant RLS layer, SQL, types
  ui/           @hybrid/ui — shadcn primitives + Doreja storefront components
  config/       @hybrid/config — ESLint (incl. no-raw-sql rule), tsconfig, Tailwind preset
```

Key files:
- `packages/db/src/withTenant.ts` — the RLS transaction wrapper; the only legal path to tenant data
- `packages/db/test/rls.test.ts` — the five-test CI gate
- `apps/web/middleware.ts` — host to tenant rewrite
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
The five tests pass; only the teardown step (deleting the embedded-postgres data directory)
may fail with `EBUSY` on Windows. The test results are valid. Simply rerun or ignore the
non-zero exit code in local development. CI (Linux) is unaffected.

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
- `docs/DESIGN.md` — "Bazaar Modern" design system (tokens, Bangla typography, Doreja theme)
- `docs/ARCHITECTURE.md` — concise architecture reference
- `CHANGELOG.md` — version history
