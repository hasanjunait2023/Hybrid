# Hybrid

Local-first, multi-tenant commerce platform ("Shopify for Bangladesh").
Phase 0: prove hard tenant isolation (RLS) + "admin edit → storefront update".

## Stack (LOCKED)

Next.js App Router · TypeScript strict · Turborepo + pnpm · PostgreSQL 16 + RLS ·
postgres.js (`withTenant`) for tenant data · Redis 7 · Tailwind + shadcn.

## Layout

```
apps/
  web/   Next.js — the only running app in P0 (storefront/admin/platform/marketing)
  api/   FastAPI worker — empty stub (Phase 1+)
packages/
  db/      @hybrid/db     postgres.js client, withTenant, migrate, SQL, types
  ui/      @hybrid/ui     shared primitives + theme tokens (skeleton in P0)
  config/  @hybrid/config eslint / tsconfig / tailwind presets + no-raw-sql rule
```

## Local runbook

```bash
cp .env.example .env.local        # defaults already target local Docker
docker compose up -d              # Postgres 16 + Redis 7; SQL auto-applies 00→04
pnpm install
pnpm --filter @hybrid/db db:gen   # generate src/types.ts from the live schema
pnpm --filter @hybrid/db test     # RLS isolation suite (THE gate) — must pass
pnpm dev                          # http://store-a.lvh.me:3000, store-b.lvh.me:3000
```

`docker compose up -d` runs the SQL in `packages/db/sql/` in lexical order on
first boot. If the DB already exists, run migrations/seed explicitly:

```bash
pnpm --filter @hybrid/db db:migrate   # 00 roles, 01 schema, 02 policies, 04 grant
pnpm --filter @hybrid/db db:seed      # 03 seed
```

## The golden rule

All tenant data goes through `withTenant(tenantId, userId, tx => ...)` from
`@hybrid/db`, which runs as the non-superuser `app_runtime_login` role so RLS is
enforced. Importing `postgres` or `@hybrid/db/client` outside `packages/db` is an
ESLint error (`no-raw-sql`).
