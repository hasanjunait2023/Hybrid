# Hybrid — CLAUDE.md

This is the canonical context file for every Claude session working on this repository.
Read this before touching any file.

---

## What is Hybrid

Hybrid is a Bengali-first, mobile-first multi-tenant commerce SaaS — "Shopify for Bangladesh."
Each seller gets an admin backend, a live themed storefront on a subdomain (later a custom domain),
and native integration with bKash/Nagad/COD and Bangladesh's courier network (Steadfast, Pathao,
RedX, Paperfly). Hard tenant isolation is enforced at the database layer via Postgres RLS.

Current status: Phase 0 complete (the multi-tenant spine). Phase 1 (sellable MVP) is next.

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
│   ├── web/                Next.js App Router — the only running app in Phase 0
│   │   ├── middleware.ts   host → tenant rewrite (node.js runtime)
│   │   ├── app/
│   │   │   ├── (marketing)/        marketing site (lvh.me root)
│   │   │   ├── (platform)/         super-admin (app.lvh.me → /platform)
│   │   │   ├── (admin)/admin/      tenant admin (admin.lvh.me → /admin)
│   │   │   ├── _sites/[tenant]/    storefront (store-a.lvh.me → /_sites/store-a)
│   │   │   ├── dev-login/          HMAC-signed dev session cookie (dev only)
│   │   │   └── store-not-found/    branded 404 for unknown hosts
│   │   └── lib/
│   │       ├── auth/session.ts     getSession() — Phase 0: HMAC dev cookie; Phase 1: Supabase Auth
│   │       ├── tenant/resolve.ts   resolveTenantByHost() — Redis TTL 1h → DB fallback
│   │       ├── redis/client.ts     ioredis client (REDIS_URL)
│   │       ├── storefront/data.ts  getStorefrontProducts(), getTenantContextBySlug() (unstable_cache)
│   │       └── admin/data.ts       getAdminProducts()
│   └── api/                FastAPI stub — empty, Phase 1+
└── packages/
    ├── db/    @hybrid/db
    │   ├── sql/
    │   │   ├── 00_roles.sql        app_runtime_login LOGIN role (runs first)
    │   │   ├── 01_schema.sql       full schema (canonical, do not edit)
    │   │   ├── 02_policies.sql     RLS policies (canonical, do not edit)
    │   │   ├── 03_seed.sql         dev seed: 2 tenants, 6 products, 4 plans
    │   │   └── 04_grant_login.sql  GRANT app_runtime TO app_runtime_login (runs last)
    │   ├── src/
    │   │   ├── client.ts           INTERNAL — sql (app_runtime_login) + adminSql (postgres)
    │   │   ├── withTenant.ts       THE contract — exported as the only tenant data path
    │   │   ├── migrate.ts          db:migrate (00,01,02,04) and db:seed (03)
    │   │   ├── types.ts            kysely-codegen output (regenerate with pnpm db:gen)
    │   │   └── index.ts            public exports: withTenant, asPlatformAdmin, adminSql, types
    │   └── test/
    │       ├── global-setup.ts     boots embedded-postgres (NO Docker needed); writes .pgtmp.json
    │       ├── setup.ts            per-worker: reads .pgtmp.json → sets env before client.ts imports
    │       └── rls.test.ts         5-test RLS isolation gate (THE CI gate for every PR)
    ├── ui/    @hybrid/ui
    │   └── src/
    │       ├── globals.css         all design tokens (CSS custom properties)
    │       └── components/
    │           ├── storefront/     StoreHeader, Hero, ProductCard, ProductGrid, TrustBand, etc.
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

### Step 4 — Run the RLS isolation gate (no Docker needed)

```bash
pnpm --filter @hybrid/db test
```

This runs five isolation tests against a real Postgres (embedded-postgres, zero system deps):

1. Tenant A sees only A's products
2. Tenant A querying for B's rows returns 0 rows
3. Cross-tenant INSERT is rejected by RLS WITH CHECK
4. Platform admin (`asPlatformAdmin`) sees both A and B
5. `order_number` sequences independently per tenant (A: 1, B: 1, A: 2)

All five must be green. This is the required CI gate on every PR.

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
| `store-a.lvh.me:3000` | Tenant A storefront (indigo accent) |
| `store-b.lvh.me:3000` | Tenant B storefront (distinct accent — visual proof of isolation) |
| `admin.lvh.me:3000/dev-login?as=owner-a` | Sets HMAC-signed dev session cookie for owner-a |
| `admin.lvh.me:3000/admin/products` | Tenant A admin product list |
| `admin.lvh.me:3000/dev-login?as=owner-b` | Switch to owner-b session |
| `lvh.me:3000` | Marketing site stub |
| `app.lvh.me:3000` | Platform super-admin stub |
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

**Phase 0:** HMAC-signed dev cookie (`hybrid_dev_session`). Set by `/dev-login?as=owner-a|owner-b|admin`.
The cookie is `{userId}.{hmac-sha256}`. Only valid when `NODE_ENV !== 'production'`.
Constant-time compare prevents timing oracles. `DEV_SESSION_SECRET` must be set.

**Phase 1:** Replace the body of `getSession()` with a Supabase Auth lookup. Callers are
unchanged — the seam is intentional.

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
   (`.pgtmp`). The 5 tests still run and pass; only the exit code may flip to non-zero on
   Windows. Linux/macOS (CI) is unaffected. If you see a teardown EBUSY error, rerun —
   the test results themselves are valid. Fix: force-kill the cluster + retry rmdir.

2. **ioredis `Unhandled error event` log spam** — Under a sustained Redis outage, the ioredis
   client emits noise to the console. The resolve layer already falls through to the DB safely;
   adding `.on('error', () => {})` on the client silences it. Tracked for Phase 1.

3. **`unstable_cache` multi-instance caveat** — On Vercel, `unstable_cache` is per-instance
   (file-system). Add the Upstash cache handler before deploying to production (Phase 1 task).

---

## Roadmap context

```
Phase 0 (DONE) — multi-tenant spine: withTenant RLS layer, host middleware, Doreja storefront, admin→ISR loop
Phase 1 (next)  — sellable MVP: auth (Supabase), products CRUD, orders, COD checkout, Steadfast courier, SMS
Phase 2         — custom domains, theme catalog, visual customizer, COD reconciliation
Phase 3         — funnel builder, self-serve bKash billing, plan limits
Phase 4         — full section editor, multi-step funnels, scale hardening
```

Open Phase-0→1 decisions:
- bKash product tier for storefront checkout and SaaS billing (decide at Phase 1)
- Root domain: `myhybrid.com` (placeholder; swap in `NEXT_PUBLIC_ROOT_DOMAIN`)

Source documents: `docs/PRD.md`, `docs/BUILD_CHECKLIST.md`, `docs/architecture/phase0-blueprint.md`,
`docs/DESIGN.md`, `docs/research/phase0-brief.md`, `.claude/team/DECISIONS.md`.
