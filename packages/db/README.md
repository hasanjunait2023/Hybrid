# @hybrid/db

Postgres client (`postgres.js`), `withTenant` / `asPlatformAdmin` RLS context
helpers, the migrate runner, and the canonical SQL (`sql/00..04`).

## Running the RLS test gate

```bash
pnpm --filter @hybrid/db test
```

This needs **nothing external** — no Docker, no system Postgres. `test/global-setup.ts`
boots an ephemeral **embedded-postgres** (real Postgres 16) on a random free port,
applies `sql/00_roles → 01_schema → 02_policies → 03_seed → 04_grant_login` over the
superuser connection (RLS bypassed for DDL/seed), then runs the suite as the
non-superuser `app_runtime_login` role (RLS forced) through `withTenant`. The
cluster lives under `packages/db/.pgtmp` (git-ignored) and is torn down after the run.

## Docker alternative (devs who have Docker)

`docker-compose up -d` boots `postgres:16-alpine` and auto-applies the same SQL via
`/docker-entrypoint-initdb.d`. With `.env.local` populated (`DATABASE_URL` =
`app_runtime_login`, `DIRECT_URL` = `postgres` superuser), `pnpm db:migrate` / `db:seed`
and the same `test` command run against that instance instead — the test setup falls
back to `.env.local` when no embedded handoff file is present.
