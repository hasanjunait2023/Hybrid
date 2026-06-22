# Deploy Seam — local-first → cloud

Phase 0 runs entirely local-first (docker-compose Postgres + Redis, `lvh.me` wildcard).
Nothing here is provisioned in cloud yet. This document is the exact checklist for the
day cloud lands: **Vercel for Platforms + Supabase + Upstash**. It maps every seam that
already exists in code to the cloud value that swaps in. No code change should be needed
beyond env vars and one cache handler — the abstractions are already in place.

## 1. Environment variables

All consumed via `process.env`; defaults/stubs live in `.env.example`. Set these as
Vercel project env vars (Production + Preview). Never commit real values.

| Var | Local | Cloud value |
|-----|-------|-------------|
| `DATABASE_URL` | `app_runtime_login@localhost` | **Supabase pooled** (Supavisor, port 6543, transaction mode). Connect as `app_runtime_login` (non-superuser → RLS forced). |
| `DIRECT_URL` | `postgres@localhost` | **Supabase direct** (port 5432). Used only for migrations / seed / type-gen / host lookup. |
| `REDIS_URL` | `redis://localhost:6379` | **Upstash** Redis URL. See §3 for the REST swap if connecting from edge. |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `lvh.me` | `myhybrid.com` (or chosen apex). Drives middleware host→tenant routing. |
| `DEV_SESSION_SECRET` | `dev-only-change-me` | Real session secret (rotate; replace dev-login stub with real auth before public launch). |
| `APP_ENCRYPTION_KEY` | dev stub | **32-byte base64** key for gateway/courier credential encryption. |
| `VERCEL_API_TOKEN` / `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID` | empty | Domains API credentials — see §5. |

## 2. Postgres connection — already pooler-ready

`packages/db/src/client.ts` already sets `prepare: false` on both pools. This is
**required** under Supabase's transaction-mode pooler (Supavisor / pgBouncer); prepared
statements break across pooled connections. No change needed — just point the URLs.

- Runtime traffic (`DATABASE_URL`) → `app_runtime_login` (non-superuser) → **RLS is FORCED**.
- Migrations/seed (`DIRECT_URL`) → `postgres` (superuser) → RLS bypassed by design.

### app_runtime_login role provisioning on Supabase

The migration set creates and wires this role; it must run on Supabase via `DIRECT_URL`:

- `sql/00_roles.sql` — creates `app_runtime_login` (LOGIN, INHERIT). **Change the
  password** from the local `app_runtime_local_pw` to a real secret on Supabase, and use
  that password in the cloud `DATABASE_URL`.
- `sql/02_policies.sql` — creates the `app_runtime` NOLOGIN group + grants.
- `sql/04_grant_login.sql` — `grant app_runtime to app_runtime_login` (runs LAST).

Order matters: 00 → 01 → 02 → 03 → 04. Run all five against `DIRECT_URL` once at provision.

## 3. Redis / Upstash + the ISR cache handler

Two separate concerns:

**(a) App-level cache** (`apps/web/lib/redis/client.ts`) is already behind the
`CacheClient` interface. Swap the `ioredis` implementation for an Upstash REST client
inside `getCache()` — callers (`resolve.ts`, `storefront/data.ts`) don't change.

**(b) Cross-instance ISR — the one piece NOT yet built.** On Vercel, `revalidateTag()`
must propagate across serverless instances, so Next's default in-memory ISR cache is
insufficient. Wire a **custom ISR cache handler** backed by Upstash:

```js
// next.config.mjs (cloud)
const nextConfig = {
  cacheHandler: require.resolve('./cache-handler.cjs'), // Upstash-backed
  cacheMaxMemorySize: 0, // disable in-memory cache; force shared store
  ...
};
```

The handler implements `get/set/revalidateTag` against Upstash so a `revalidateTag`
fired by an admin edit invalidates the storefront cache on every instance. This is the
admin-edit → storefront freshness guarantee at scale. **Build this when cloud lands.**

## 4. Wildcard domain + tenant routing

`apps/web/middleware.ts` already does host→tenant resolution and rewrites
`*.ROOT` → `/_sites/[tenant]`, with `app.` → platform and `admin.` → admin. It runs on
the **Node.js runtime** (postgres.js + ioredis are Node-only) — keep that.

To go live:
- Point a **wildcard DNS** `*.myhybrid.com` at Vercel.
- Add `myhybrid.com` + `*.myhybrid.com` as Vercel domains.
- Custom tenant domains get added programmatically via the **Vercel Domains API** using
  `VERCEL_API_TOKEN` (+ project/team IDs). That's the per-tenant custom-domain flow.

## 5. CI / verification

CI already runs the **RLS gate** (`pnpm --filter @hybrid/db test`, embedded-postgres,
no Docker). Keep it as a required check — it proves cross-tenant isolation on every PR
before any deploy. Pre-deploy gate = `typecheck` + `lint` + `build` + RLS gate, all green.

## 6. Rollback

Vercel deployments are immutable + atomic: rollback = **promote the previous deployment**
in the Vercel dashboard/CLI (instant, no rebuild). DB migrations are forward-only — never
auto-run destructive migrations on deploy; gate them separately behind `DIRECT_URL`.
