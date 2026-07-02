# Hybrid Phase B Implementation Notes

## What is now ready

1. **Read-replica seam** in `@hybrid/db`
   - `READ_DATABASE_URL` env var support (falls back to `DATABASE_URL` when unset).
   - `readSql` client in `packages/db/src/client.ts`.
   - `withReadOnlyTenant()` helper in `packages/db/src/withTenant.ts` — same RLS
     contract as `withTenant()`, but opens a read-only transaction on the
     replica. Writes inside the callback are rejected by `SET TRANSACTION READ ONLY`.

2. **Multi-instance web service compose**
   - `docker-compose.prod.phaseb.yml` extends the existing compose and sets
     `deploy.replicas: 2` for the web service.
   - Includes rolling-update / rollback config for zero-downtime deploys.

3. **Caddy load-balanced upstreams**
   - `infra/phaseb/Caddyfile.upstreams` uses Caddy `dynamic_upstreams` against the
     Docker embedded DNS resolver (`127.0.0.11:53`) so each web replica is
     discovered and balanced automatically.
   - Health checks hit `/api/healthz`; unhealthy replicas are removed from rotation.

## How to enable Phase B on the production VPS

### Step 1 — Add READ_DATABASE_URL (optional but recommended)

If/when a managed read replica is provisioned, add to `/root/hybrid.env`:

```bash
READ_DATABASE_URL=postgres://app_runtime_login:<password>@<replica-host>:5432/hybrid
```

If not set, `withReadOnlyTenant()` transparently falls back to the primary DB.

### Step 2 — Switch to the Phase B compose

```bash
ssh mt5vps
cd /opt/hybrid
docker compose --env-file .env.deploy -f docker-compose.prod.yml down web
docker compose --env-file .env.deploy -f docker-compose.prod.phaseb.yml up -d web
```

This spins up 2 web replicas. Verify with:

```bash
docker ps --filter name=web --format "{{.Names}}\t{{.Status}}"
```

### Step 3 — Update Caddy for load balancing

Back up the existing Caddyfile, then apply the Phase B upstream blocks:

```bash
cp /opt/hybrid/Caddyfile /opt/hybrid/Caddyfile.phasea.bak
# Replace each `reverse_proxy web:3000` with the blocks from
# infra/phaseb/Caddyfile.upstreams, preserving the site names and TLS policy.
docker exec hybrid-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

### Step 4 — Verify

```bash
# Two healthy web containers
docker ps --filter name=web

# Caddy resolves both upstreams
docker exec hybrid-caddy caddy list-modules | grep dynamic_upstreams

# Health checks pass repeatedly
curl -sS https://junno.qzz.io/api/healthz
curl -sS https://junno.qzz.io/api/healthz/db
```

## When to actually deploy Phase B

Trigger signals:
- k6 load test shows p95 latency > 1 s or error rate climbing.
- Single web container CPU/memory is saturated.
- You want higher availability during deploys.

Until then, Phase A remains live and the new code is backward compatible.

## Operational notes

- `docker-compose.prod.phaseb.yml` intentionally does NOT define a separate
  read-replica container; the self-hosted Supabase Postgres already exists and
  read replicas are best provisioned through the hosting provider (Coolify/DO
  managed Postgres) rather than DIY streaming replication.
- Redis is still a single container. For true Redis HA/cluster, that is Phase C.
- Background cron routes (`/api/internal/*`) currently run on every web replica
  if called externally. Internal cron invocations via a single scheduler
  (Coolify cron / external cron service) are recommended to avoid duplicate
  sweeps.
