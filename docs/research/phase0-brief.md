# Phase 0 Research Brief — Hybrid (de-risking the critical path)

> Produced at RESEARCH/M1. Feeds the architect blueprint. Citations in-line.

## TL;DR recommendations
1. **FIX 02_policies.sql blocking defect:** `create role app_runtime nologin` cannot be connected as. Add a LOGIN role: `app_runtime_login LOGIN PASSWORD ...; GRANT app_runtime TO app_runtime_login;` App connects as `app_runtime_login` (inherits grants, non-superuser → RLS engages). Migrations/seed run as `postgres` superuser (bypasses RLS).
2. **withTenant() = postgres.js `sql.begin()` + `set_config(..., true)` (transaction-local) inside.** Never leaks across pooled connections. Set `prepare: false` for pgBouncer/Supavisor transaction mode.
3. **Local dev:** `NEXT_PUBLIC_ROOT_DOMAIN=lvh.me` (`*.lvh.me` → 127.0.0.1, zero config, all browsers). docker-compose `postgres:16-alpine` (pgcrypto/citext/pg_trgm bundled).
4. **Middleware:** host → subdomain/custom-domain → internal rewrite to `/_sites/[tenant]/...`; Redis cache host→tenant.
5. **ISR:** `unstable_cache` + per-tenant cache tags; admin Server Action calls `revalidateTag(\`tenant:{id}:products\`)`.
6. **RLS tests:** app-level Vitest integration tests via real `withTenant()` against Docker Postgres in CI. THE Phase-0 gate.

## Finding 1 — withTenant() + pooling
`set_config(name, val, true)` is transaction-local → cleared at COMMIT/ROLLBACK → safe under transaction-mode pooling ONLY if always inside an explicit txn. pgBouncer transaction mode does NOT support session-level SET (cleared on connection return). Supabase: port 5432 = session, 6543 = transaction (session mode on 6543 deprecated 2025-02-28). Use **postgres.js** — `sql.begin()` auto-reserves one connection, BEGIN/COMMIT/ROLLBACK automatic, returns to pool clean.

```typescript
// packages/db/src/client.ts
import postgres from 'postgres'
export const sql = postgres(process.env.DATABASE_URL!, { max: 10, idle_timeout: 20, prepare: false })

// packages/db/src/withTenant.ts
export async function withTenant<T>(tenantId: string, fn: (tx: typeof sql)=>Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
    await tx`SELECT set_config('app.is_platform_admin', 'false', true)`
    return fn(tx)
  })
}
export async function asPlatformAdmin<T>(fn: (tx: typeof sql)=>Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', '', true)`
    await tx`SELECT set_config('app.is_platform_admin', 'true', true)`
    return fn(tx)
  })
}
```
Invariants: set_config always inside `sql.begin`; throw → auto ROLLBACK, no GUC residue; `prepare:false` required under pooler; forbid importing `sql` outside `packages/db` (ESLint rule). All tenant queries take `tx`, not `sql`.

## Finding 2 — app_runtime NOLOGIN bug (CRITICAL)
`NOLOGIN` role cannot open a connection (`FATAL: role not permitted to log in`). The self-test `set role app_runtime` in psql passes (SET ROLE works on NOLOGIN group from a privileged session) → misleading. Fix: two-role split (group `app_runtime` NOLOGIN holds grants + LOGIN `app_runtime_login` inherits), OR add LOGIN to app_runtime directly. Migration conn = `postgres` superuser (bypass RLS for seed/DDL); runtime conn = `app_runtime_login` (RLS forced). `.env`: `DATABASE_URL`=runtime, `DIRECT_URL`=superuser.

## Finding 3 — Next.js host middleware
Vercel Platforms Starter Kit pattern: read Host, strip dev port; root/www → marketing (no rewrite); `app.<root>` → `/platform`; `*.<root>` → subdomain slice; else custom domain → Redis/DB lookup → `/_sites/[tenant]/...` rewrite (browser URL unchanged). `matcher: ['/((?!api/|_next/|_static/|[\\w-]+\\.\\w+).*)']`. Redis cache `domain:{host}` TTL 1h, cache null briefly (60s) to avoid hammering; invalidate on domain add/verify/remove. Local: lvh.me (recommended) > /etc/hosts > *.localhost (Chrome only).

## Finding 4 — ISR / on-demand revalidation
`unstable_cache(fn, [key], { revalidate, tags: ['tenant:{id}', 'tenant:{id}:products'] })`. Admin Server Action: `revalidateTag('tenant:{id}:products')` (+ single-product tag). Next 16: prefer two-arg `revalidateTag(tag, 'max')`; `{ expire: 0 }` for immediate. Tag scheme: `tenant:{id}` / `:products` / `:product:{id}` / `:theme` / `:page:{slug}` / `:navigation`. PROD on Vercel multi-instance needs custom cache handler → Upstash (file-system cache is per-instance). `unstable_cache` may migrate to `'use cache'` later.

## Finding 5 — Local Docker Postgres
`postgres:16-alpine`; mount `docs/01_schema.sql`,`02_policies.sql`,`03_seed.sql` into `/docker-entrypoint-initdb.d/` (alpha order = correct run order); healthcheck pg_isready. Extensions bundled. `DATABASE_URL=postgres://app_runtime_login:...@localhost:5432/hybrid`, `DIRECT_URL=postgres://postgres:postgres@localhost:5432/hybrid`. Wildcard subdomains: lvh.me.

## Finding 6 — RLS test harness
App-level Vitest integration tests (not pgTAP — avoids Perl dep) against real Docker Postgres in CI. Validates policies + withTenant + role split + asPlatformAdmin together. 5 tests: A sees only A; A cannot read B; cross-tenant INSERT blocked (WITH CHECK); platform admin sees all; per-tenant order_number independent sequencing. Optional: `pgrls` static policy linter in CI.

## OPEN RISKS — for the architect to resolve
- **app.current_user_id in withTenant:** does withTenant also take userId + set `app.current_user_id` GUC, or is user identity checked at app layer before? (app_user RLS self-read needs it.) DECIDE.
- **Tenant provisioning/signup:** new-tenant writes (tenant row, order_counter seed, domain record) must run via `asPlatformAdmin` or migration conn — `tenant` INSERT policy needs `owner_user_id = current_user_id()` or admin. Confirm signup uses asPlatformAdmin.
- **order_number trigger:** `assign_order_number()` does INSERT...ON CONFLICT on order_counter; trigger runs as definer — verify created during migrations by superuser (not app_runtime_login). RLS on order_counter still applies to the INSERT path under FORCE RLS unless SECURITY DEFINER — verify counter writes succeed under withTenant (they should, since order_counter has the tenant isolation policy and tenant_id matches current tenant).
- **prepare:false** must be set before any cloud pooler connection added.
