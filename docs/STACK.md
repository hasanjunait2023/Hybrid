# STACK — exact tooling & constraints

> Mirrors the LOCKED stack table in [CLAUDE.md](../CLAUDE.md). That file wins on any conflict.
> **Do not debate or deviate from these.**

| Concern | Decision |
|---|---|
| Framework | Next.js (App Router), TypeScript strict, latest stable |
| Monorepo | Turborepo + pnpm workspaces |
| DB | Self-hosted Supabase Postgres 15 + RLS via `app.current_tenant_id` GUC |
| Runtime DB access | `postgres.js` + `withTenant()` / `asPlatformAdmin()` — never raw `sql`/Supabase client for tenant data |
| Hosting | Self-hosted on VPS (Docker + Caddy, wildcard `*.hybrid.ecomex.cloud`) |
| Auth | Supabase GoTrue (`AUTH_PROVIDER=supabase`) + app opaque session |
| Storage | Supabase MinIO (`BLOB_DRIVER=s3`), CDN `cdn.hybrid.ecomex.cloud` |
| Cache | Redis (`hybrid-redis` self-hosted) |
| Async / heavy jobs | FastAPI service (`apps/api/`) — courier sync, reconciliation |
| Payments | bKash, Nagad, SSLCommerz, COD |
| Couriers | Steadfast (Phase 1), Pathao / RedX / Paperfly (Phase 2+) |
| Styling | Tailwind + shadcn/ui (tokens in `packages/ui/src/globals.css`) |

## Versions / prerequisites
- Node >= 20, pnpm >= 10
- No Docker required for the RLS test gate (embedded-postgres)
- Python (FastAPI) for `apps/api/` jobs

## Workspace packages
`@hybrid/db` · `@hybrid/payments` · `@hybrid/couriers` · `@hybrid/ui` · `@hybrid/config`
