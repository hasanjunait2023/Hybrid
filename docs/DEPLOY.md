# Deploy Seam — local-first → cloud

> ⛔ **SUPERSEDED (2026-06-25).** This document describes an OLD planned target
> (**Vercel for Platforms + Supabase Cloud + Upstash**) that was **NOT** the path taken.
> Production now runs **self-hosted Supabase on a single VPS** (Docker + Caddy). For the
> live architecture and all operational procedures, read **[INFRA_SUPABASE.md](INFRA_SUPABASE.md)**.
> Keep this file only as historical reference / a possible future Vercel migration path.

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

---

## 7. Phase 1 (M2) deploy delta

Phase 1 (sellable MVP) adds payments, couriers, SMS, billing, and real auth seams.
The base seam in §1–§6 is unchanged; the items below are **new** for a real deploy.
Tagged locally as `phase-1` (commit `031f925`). Nothing has been pushed or deployed.

### New required env vars (beyond §1)

| Var | Purpose | Notes |
|-----|---------|-------|
| `APP_ENCRYPTION_KEY` | AES-256-GCM sealing of gateway/courier credentials | **Base64 32-byte** key. Fail-fast at startup (`packages/db/src/crypto.ts`). Already listed in §1; now load-bearing — payment/courier accounts won't seal without it. |
| `CRON_SECRET` | Auth for internal cron routes | Guards `/api/internal/billing-sweep` and `/api/internal/courier-sync` via constant-time compare. Set as a Vercel env var; pass as bearer/secret from the cron scheduler. |
| `AUTH_PROVIDER` | Selects the auth backend | Phase 1 ships the HMAC dev-cookie seam (`getSession()`). Set to the Supabase provider when cloud auth lands; callers are unchanged. |
| `BKASH_*` (sandbox) | bKash checkout credentials | `BKASH_BASE_URL`, `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD` (names per `.env.example`). **Sandbox** values for now; live needs a merchant account (see below). Callback: `/api/bkash/callback`. |
| `STEADFAST_*` | Steadfast courier API | `STEADFAST_API_KEY`, `STEADFAST_SECRET`, `STEADFAST_BASE_URL`. Consume the encrypted per-tenant credentials path where applicable; platform-level keys via env. |
| `SMS_*` | Transactional SMS (order/courier notifications) | Provider base URL + key per `.env.example`. |
| `NEXT_PUBLIC_ROOT_DOMAIN` | host→tenant routing apex | Already in §1; reconfirmed required (middleware depends on it). |
| `REDIS_URL` | host→tenant cache + sessions | Already in §1; Upstash in cloud. |
| `DATABASE_URL` / `DIRECT_URL` | runtime (RLS) / superuser conns | Already in §1; unchanged. |

Real values are never committed — `.env.example` holds dev placeholders/sandbox stubs only;
CI sets test-only fixtures inline in `.github/workflows/ci.yml`.

### Still pending before multi-instance production

- **Upstash ISR cache handler** (§3b) is still NOT built. `revalidateTag()` is in-memory
  per-instance on Vercel; the admin-edit → storefront freshness guarantee needs the
  Upstash-backed `cacheHandler` before going multi-instance. This is the one known
  cross-instance correctness gap.

### Live integrations deferred (need merchant/provider accounts)

These run against **sandbox/dev** in Phase 1 and require real accounts before production:

- **bKash live** — needs a live bKash merchant account + production app credentials
  (Phase-0→1 open decision on bKash product tier is still open).
- **Steadfast live** — needs a live Steadfast merchant API key.
- **SMS live** — needs a live SMS provider account + sender ID.
- **Supabase cloud auth** — `getSession()` is a clean seam; swap the HMAC dev cookie for
  the Supabase Auth lookup when the cloud project is provisioned (`AUTH_PROVIDER`).

---

## 8. Phase 2 (M3) deploy delta — Supabase dropped; own-auth + S3 + per-tenant creds

Phase 2 drops Supabase entirely in favour of **own auth** (opaque DB session tokens,
Argon2id password hashing) and an **S3-compatible blob store**. Provider credentials
(bKash, Nagad, SSLCommerz, Steadfast, Pathao, tenant SMS, WhatsApp) are **per-tenant,
sealed in the DB** — they are NOT env vars. The base seam in §1–§6 still holds.

### Removed env vars (Supabase-only)

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The `AUTH_PROVIDER=supabase`
and `BLOB_DRIVER=supabase` options are gone.

### New / changed env vars

| Var | Purpose | Notes |
|-----|---------|-------|
| `AUTH_PROVIDER` | Selects the auth backend | Phase 2 adds `password` (own auth, production default). `dev` (HMAC cookie) stays for local; `supabase` removed. |
| `SESSION_SECRET` | Signs/derives own-auth session tokens | 32+ random bytes (`openssl rand -base64 32`). Fail-fast if unset in production. |
| `SESSION_MAX_AGE_SECONDS` | Session lifetime | Default `604800` (7 days). |
| `SMS_API_KEY` / `SMS_SENDER_ID` / `SMS_LIVE` | **Platform** sms.net.bd key for signup OTP only | Per-tenant SMS keys are pasted in Settings and sealed in the DB. |
| `BLOB_DRIVER` | Blob backend | `local` (dev) or `s3` (production). The `supabase` option is removed. |
| `S3_BUCKET` / `S3_ENDPOINT` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_PUBLIC_URL` | S3-compatible product-image storage (`BLOB_DRIVER=s3`) | `S3_ENDPOINT` empty = AWS S3; full URL for R2/B2/MinIO. Recommended: Cloudflare R2 (`region=auto`, no egress). |
| `PLATFORM_S3_*` | Separate bucket for theme previews / platform assets | Same shape as `S3_*`. |
| `VERCEL_DOMAINS_ENABLED` | Custom-domain flag | `false` by default — domain rows + DNS instructions are written without calling Vercel. Flip to `true` with `VERCEL_API_TOKEN` set to activate the live Domains API path. |

### Build config

`apps/web/next.config.mjs` adds `@node-rs/argon2` to `serverExternalPackages` (alongside
`postgres`) so the napi-rs native binary is not bundled. `@aws-sdk/client-s3` is loaded via
**dynamic import** inside `getBlobStore()` (s3 case) — no externalization needed, and it
stays out of the bundle until `BLOB_DRIVER=s3`.

Every var the app reads is declared in `turbo.json` `globalEnv` (otherwise Turborepo strips
it from the task environment and production breaks — the exact failure class seen in Phase 1).
