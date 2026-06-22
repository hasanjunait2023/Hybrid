# Hybrid — Architecture Reference

Concise reference for Phase 0. Read `docs/architecture/phase0-blueprint.md` for the full
approved blueprint and decision rationale. Read `docs/PRD.md` for product context.

---

## Multi-tenancy model

Every tenant table carries a `tenant_id UUID` column. Row-level security is enforced in
Postgres via a session-local GUC:

```sql
-- Set per transaction by withTenant():
SELECT set_config('app.current_tenant_id', '<uuid>', true);
```

RLS policies filter every row by `tenant_id = current_setting('app.current_tenant_id')::uuid`.
The `true` argument makes the setting transaction-local — it is cleared on `COMMIT` or
`ROLLBACK` and never leaks across pooled connections.

### Two-role split

```
app_runtime       NOLOGIN  — holds all table grants (the canonical role in 02_policies.sql)
app_runtime_login LOGIN    — inherits app_runtime; this is what DATABASE_URL connects as
postgres          SUPERUSER — DIRECT_URL; used only for migrations, seed, type gen
```

`app_runtime_login` is a non-superuser. When it connects, `FORCE ROW LEVEL SECURITY`
policies engage on all tables. Migrations and seed run as `postgres` (superuser, bypasses
RLS) via `DIRECT_URL`. This split is the NOLOGIN-defect fix: see `00_roles.sql` and
`04_grant_login.sql`.

### `withTenant()` contract

```ts
// packages/db/src/withTenant.ts
withTenant(tenantId, userId, (tx) => Promise<T>): Promise<T>
```

Opens a `sql.begin()` transaction, sets the three GUCs (`app.current_tenant_id`,
`app.current_user_id`, `app.is_platform_admin`), executes the callback with the transaction
handle `tx`, and commits. A thrown error triggers automatic rollback with no GUC residue.
`prepare: false` is set on the postgres.js client — required for pgBouncer/Supavisor
transaction-mode pooling.

`asPlatformAdmin()` sets `app.is_platform_admin = 'true'` and empty tenant/user GUCs.
Used for host→tenant resolution and tenant provisioning.

### ESLint guard

`packages/config/eslint/no-raw-sql.mjs` bans `import 'postgres'` and
`import '@hybrid/db/client'` in all consumer packages. A direct import of the postgres.js
driver bypasses the GUC setup and silently leaks cross-tenant data. This rule is a
build-breaking error.

---

## Request flow

```
Browser request (store-a.lvh.me:3000/products)
  |
  v
middleware.ts  (Node.js runtime, runs on every non-asset request)
  |  reads Host header
  |  strips port -> "store-a.lvh.me"
  |
  +-- ROOT (lvh.me)              -> NextResponse.next()  [marketing route group]
  +-- sub == "app"               -> rewrite /platform/*  [super-admin route group]
  +-- sub == "admin"             -> rewrite /admin/*     [tenant admin route group]
  +-- otherwise: resolveTenantByHost(host)
        |
        +-- Redis cache hit ("domain:store-a.lvh.me" -> {id, slug})  -> use cached
        +-- Redis miss -> asPlatformAdmin DB lookup:
              SELECT t.id, t.slug
              FROM tenant_domain d JOIN tenant t ON t.id = d.tenant_id
              WHERE d.domain = $host AND d.verified = true AND t.status = 'active'
              LIMIT 1
            -> cache result TTL 1h (MISS sentinel TTL 60s)
        |
        +-- null -> rewrite /store-not-found
        +-- {id, slug} -> rewrite /_sites/{slug}{pathname}
  |
  v
_sites/[tenant]/layout.tsx
  getTenantContextBySlug(slug)   [unstable_cache, tags: tenant:{id}, tenant:{id}:theme]
    -> asPlatformAdmin: SELECT tenant + active theme_settings
    -> sets CSS vars (--color-primary, --color-accent) from theme JSON
  |
  v
_sites/[tenant]/page.tsx  (or /products/page.tsx)
  getStorefrontProducts(tenantId)  [unstable_cache, tags: tenant:{id}, tenant:{id}:products]
    -> withTenant(tenantId, null, tx => SELECT products WHERE status='active')
    -> RLS filters to tenantId only
  |
  v
React Server Component renders Doreja theme sections
  StoreHeader, Hero, ProductGrid, ProductCard, TrustBand, StoreFooter
  (all from @hybrid/ui)
  |
  v
Response -> browser
```

---

## Admin edit to storefront ISR loop

```
Admin Server Action (apps/web/app/(admin)/admin/products/[id]/edit/actions.ts)
  1. getSession()            -> verify HMAC dev cookie -> {userId}
  2. resolveTenantByHost()   -> tenant {id, slug} (from request headers)
  3. withTenant(tenantId, userId, tx => UPDATE product SET title=..., price=...)
  4. revalidateTag(`tenant:${tenantId}:products`)
     revalidateTag(`tenant:${tenantId}:product:${productId}`)
  -> Next.js purges the unstable_cache entries for those tags
  -> next request to the storefront re-runs the DB query and renders fresh data
```

No rebuild required. ISR on-demand revalidation is the mechanism.

### Cache-tag scheme

| Tag | Scope |
|---|---|
| `tenant:{id}` | All tenant data (broad bust) |
| `tenant:{id}:products` | Product list |
| `tenant:{id}:product:{pid}` | Individual product |
| `tenant:{id}:theme` | Theme settings |
| `tenant:{id}:page:{slug}` | Store page content |
| `tenant:{id}:navigation` | Navigation |
| `tenant-slug:{slug}` | Slug to ID resolution |

Production note: `unstable_cache` is per-instance on Vercel. Replace with the Upstash
cache handler before deploying to production (Phase 1 task; the cache is isolated to
`lib/storefront/data.ts` — one file change).

---

## Package boundaries

```
apps/web
  depends on: @hybrid/db (withTenant, asPlatformAdmin, types)
              @hybrid/ui (storefront components, tokens)
              @hybrid/config (ESLint, tsconfig, Tailwind preset)

packages/db   (@hybrid/db)
  owns: postgres.js connections, withTenant, SQL files, migrate, types
  exports: withTenant, asPlatformAdmin, adminSql, generated types
  does NOT export: client.ts (the raw postgres.js handle)

packages/ui   (@hybrid/ui)
  owns: design tokens (globals.css), Doreja storefront sections, shared primitives
  no db dependency

packages/config  (@hybrid/config)
  owns: ESLint configs (incl. no-raw-sql), tsconfig bases, Tailwind preset
  no runtime dependency
```

---

## Auth seam

`apps/web/lib/auth/session.ts` exports one function: `getSession(): Promise<Session | null>`.

**Phase 0 implementation:** HMAC-SHA256-signed dev cookie (`hybrid_dev_session`).
Set by the `/dev-login?as=owner-a|owner-b|admin` route. Disabled in production
(`NODE_ENV === 'production'` returns null immediately). Constant-time compare prevents
timing oracles. `DEV_SESSION_SECRET` must be set.

**Phase 1 swap:** Replace the function body with a Supabase Auth session lookup.
Callers (`admin layout`, Server Actions) are unchanged. The seam is intentional.

---

## Where Phase 1+ plugs in

| Phase | What plugs in |
|---|---|
| Phase 1 | Supabase Auth behind `getSession()` seam; `packages/payments` (bKash/COD adapters); `packages/couriers` (Steadfast adapter); `apps/api` FastAPI workers |
| Phase 2 | Vercel Domains API + `invalidateDomainCache()`; theme catalog + visual customizer |
| Phase 3 | Funnel builder (JSON block model); self-serve bKash billing |
| Phase 4 | Full section editor; multi-step funnels; Upstash cache handler for multi-instance ISR |

---

## Local dev topology

```
localhost:3000  Next.js dev server (pnpm dev)
localhost:5432  Postgres 16 (docker-compose postgres service)
                  app_runtime_login:app_runtime_local_pw/hybrid  <- DATABASE_URL
                  postgres:postgres/hybrid                        <- DIRECT_URL
localhost:6379  Redis 7 (docker-compose redis service)           <- REDIS_URL

*.lvh.me -> 127.0.0.1  (all browsers, no /etc/hosts required)
  store-a.lvh.me:3000  ->  middleware  ->  /_sites/store-a/*
  store-b.lvh.me:3000  ->  middleware  ->  /_sites/store-b/*
  admin.lvh.me:3000    ->  middleware  ->  /admin/*
  lvh.me:3000          ->  middleware  ->  marketing (no rewrite)

RLS test harness:
  embedded-postgres (npm) on a random free port — no Docker or system PG needed
```
