#!/usr/bin/env bash
# Phase 0 DoD verification — run once Docker is available.
# Brings up Postgres+Redis, proves the NOLOGIN fix, generates types, and runs
# the RLS gate. Idempotent; safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> 1/5 docker compose up"
docker compose up -d
echo "    waiting for postgres healthcheck..."
until docker inspect --format '{{.State.Health.Status}}' hybrid-postgres 2>/dev/null | grep -q healthy; do
  sleep 2
done
echo "    postgres healthy (SQL 00->04 auto-applied on first boot)"

echo "==> 2/5 prove app_runtime_login can CONNECT (the NOLOGIN fix)"
# Connect as the runtime LOGIN role via DATABASE_URL and run a query.
docker exec hybrid-postgres psql \
  "postgres://app_runtime_login:app_runtime_local_pw@localhost:5432/hybrid" \
  -c "select current_user, session_user;" \
  -c "select set_config('app.current_tenant_id','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a',false);" \
  -c "select count(*) as a_products from product;"

echo "==> 3/5 install + generate types"
pnpm install --frozen-lockfile
pnpm --filter @hybrid/db db:gen

echo "==> 4/5 RLS test suite (THE gate)"
pnpm --filter @hybrid/db test

echo "==> 5/5 lint + typecheck"
pnpm lint
pnpm typecheck

echo "==> Phase 0 verification PASSED"
