# CONTEXT — paste this at the top of every new conversation

> Per-conversation cheatsheet for Hybrid. The full canonical context is `CLAUDE.md` at the
> repo root — this is the short version. When in doubt, the root `CLAUDE.md` wins.

## What
Hybrid — Bengali-first, mobile-first multi-tenant commerce SaaS ("Shopify for Bangladesh").
Each seller gets an admin backend, a themed storefront on a subdomain, and native bKash/Nagad/COD
+ courier (Steadfast/Pathao/RedX/Paperfly) integration. Hard tenant isolation via Postgres RLS.

Status: Phase 1 + Phase 2 (M3) complete. **Live** on self-hosted Supabase (VPS, Docker).

## Production reality (current — do NOT revert to old assumptions)
- Backend = **self-hosted Supabase** on VPS `72.62.228.196` (Docker + Caddy).
- Root domain `hybrid.ecomex.cloud` (Cloudflare wildcard → Caddy auto-TLS).
- DB = `supabase-db` (Supabase Postgres 15), Hybrid in `postgres` DB `public` schema.
- Auth = **Supabase GoTrue** (`AUTH_PROVIDER=supabase`) + app opaque `hybrid_session`.
- Storage = **Supabase MinIO** (`BLOB_DRIVER=s3`), CDN `cdn.hybrid.ecomex.cloud`.
- Cache = local `hybrid-redis`.
- NOT Vercel, NOT Upstash, NOT Supabase Cloud.

## The Golden Rule (most important)
All tenant data access goes through `withTenant()` as `app_runtime_login`. Never raw `sql`,
never the Supabase client for tenant data. `no-raw-sql` ESLint rule blocks violations (build-breaking).

```ts
import { withTenant } from "@hybrid/db";
const products = await withTenant(tenantId, userId, (tx) => tx`select * from product`);
```
`DATABASE_URL` → `app_runtime_login` (RLS forced). `DIRECT_URL` → `postgres` (migrations/seed/asPlatformAdmin).

## Stack (LOCKED — see docs/STACK.md)
Next.js App Router + TS strict · Turborepo + pnpm · self-hosted Supabase Postgres + RLS ·
postgres.js + withTenant · Supabase GoTrue · Supabase MinIO · Redis · FastAPI (heavy jobs) ·
bKash/Nagad/SSLCommerz/COD · Steadfast+ couriers · Tailwind + shadcn/ui.

## Guardrails (non-negotiable)
1. No stubs/fakes/TODO-left-behind — wire end-to-end or flag it.
2. No mock data in shipping code (seed only in `packages/db/sql/03_seed.sql`).
3. RLS sacred — never bypass at runtime.
4. Secrets never plaintext (`APP_ENCRYPTION_KEY`).
5. Every task has a verification step.
6. Mobile-first + Bengali-first are acceptance criteria.

## Map (where canonical truth lives)
| Need | File |
|---|---|
| Full context | `CLAUDE.md` (root) |
| Goal / why | `docs/GOAL.md` → `docs/PRD.md`, `.claude/team/MISSION.md` |
| Architecture / plan | `docs/PLAN.md` → `docs/ARCHITECTURE.md`, `docs/architecture/` |
| Current tasks | `docs/TASKS.md` → `docs/BUILD_CHECKLIST.md`, `.claude/team/BACKLOG.md` |
| Decisions log | `.claude/team/DECISIONS.md` |
| DB schema | `packages/db/sql/01_schema.sql` (canonical) |
| API surface | `docs/API.md` |
| Env keys | `docs/ENV.md` / `.env.example` |
| Output rules | `.claude/OUTPUT_FORMAT.md` |

## Test gate
`pnpm --filter @hybrid/db test` — 63 tests, all green (embedded-postgres, no Docker needed).

## New conversation pattern
```
[paste this file]
Today's task: <TASKS.md item / description>
Rules: anti-stub, full-file output, withTenant for all tenant data.
```
