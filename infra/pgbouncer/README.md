# PgBouncer — Transaction-Mode Connection Pooler (Phase B prep)

**Status:** Phase-A/B infrastructure prep — NOT YET APPLIED to production. Founder approval required before deploy.

## Purpose

PgBouncer is a lightweight (~10 MB) connection pooler that sits between the app and the Postgres database. It allows the app to scale to **2+ web instances** without exhausting Postgres `max_connections`.

**Key fact:** The app is already `prepare:false` (pooler-safe). This config just needs to be **deployed alongside** the existing Supabase stack when the box moves to multi-instance.

## When to deploy (Phase B trigger)

- Running 2+ web instances behind a load balancer
- Postgres is showing `max_connections` saturation (watch `postgresql_stat_activity` — if used connections > 50 of the default 100, add the pooler)

**Phase A PREP:** Deploy PgBouncer now in DEV/STAGING to validate; switch DATABASE_URL in Phase B when the first second web instance goes live.

## Architecture

```
┌─────────────┐
│  web-1      │ ──┐
└─────────────┘   │
                  │
┌─────────────┐   │        ┌──────────────┐          ┌─────────────────┐
│  web-2      │ ──┼─────>  │ PgBouncer    │ ──────>  │ supabase-db:5432│
└─────────────┘   │        │ :6432        │          │                 │
                  │        │ (transaction │          │ Postgres 15     │
┌─────────────┐   │        │  mode)       │          │                 │
│  web-N      │ ──┘        └──────────────┘          └─────────────────┘
└─────────────┘
               (all on Docker network pe9o2li2n3bns3wnofob49uw)
```

**Transaction pooling mode:** One app connection = one Postgres backend for the duration of a transaction. Clean, simple, no `SET` statement leakage between clients.

## Files in this directory

- **pgbouncer.ini** — pooler configuration template
- **userlist.txt** — credential file template (populated from Supabase env)
- **docker-compose-pgbouncer.yml** — standalone docker-compose snippet (reference; integrate into prod compose)
- **run-pgbouncer.sh** — helper to extract secrets and launch the container

## Setup & Deployment

### 1. On the VPS, extract Supabase credentials

```bash
# SSH to the box
ssh mt5vps

# Read the Postgres password from Supabase env
PGPASS=$(grep '^POSTGRES_PASSWORD=' /data/coolify/services/pe9o2li2n3bns3wnofob49uw/.env | cut -d= -f2-)
APP_USER_PASS=$(grep '^DB_POSTGRES_PASSWORD=' /opt/hybrid/.env.deploy | cut -d= -f2-)

# Save these securely — you'll need them for userlist.txt
echo "POSTGRES_PASSWORD: $PGPASS"
echo "APP_USER_PASSWORD: $APP_USER_PASS"
```

### 2. Create userlist.txt on the VPS

```bash
mkdir -p /opt/pgbouncer
cat > /opt/pgbouncer/userlist.txt <<EOF
"postgres" "<POSTGRES_PASSWORD_HERE>"
"app_runtime_login" "<APP_USER_PASSWORD_HERE>"
EOF
chmod 600 /opt/pgbouncer/userlist.txt
```

Replace `<POSTGRES_PASSWORD_HERE>` and `<APP_USER_PASSWORD_HERE>` with actual values from step 1.

### 3. Copy pgbouncer.ini to /opt/pgbouncer/

```bash
# On your local machine
scp infra/pgbouncer/pgbouncer.ini mt5vps:/opt/pgbouncer/pgbouncer.ini
```

### 4. Add PgBouncer to docker-compose.prod.yml

Integrate the service definition from `docker-compose-pgbouncer.yml` into the existing `/opt/hybrid/docker-compose.prod.yml`:

```yaml
# Add to services:
pgbouncer:
  image: edoburu/pgbouncer:latest
  container_name: hybrid-pgbouncer
  volumes:
    - /opt/pgbouncer/pgbouncer.ini:/etc/pgbouncer/pgbouncer.ini:ro
    - /opt/pgbouncer/userlist.txt:/etc/pgbouncer/userlist.txt:ro
  ports:
    - "6432:6432"
  networks:
    - pe9o2li2n3bns3wnofob49uw
  depends_on:
    - supabase-db-pe9o2li2n3bns3wnofob49uw
  restart: unless-stopped
  command: pgbouncer -u pgbouncer /etc/pgbouncer/pgbouncer.ini
```

### 5. Deploy and test

```bash
ssh mt5vps 'cd /opt/hybrid && docker compose --env-file .env.deploy -f docker-compose.prod.yml up -d pgbouncer'

# Verify it's listening
ssh mt5vps 'docker logs hybrid-pgbouncer'

# Test a connection
ssh mt5vps 'docker run --rm --network pe9o2li2n3bns3wnofob49uw postgres:15-alpine psql -h pgbouncer -p 6432 -U app_runtime_login -d postgres -c "select version()"'
```

### 6. When Phase B is triggered, update DATABASE_URL

In `/opt/hybrid/.env.deploy`, change:

**Before (Phase A, direct):**
```
DATABASE_URL=postgres://app_runtime_login:...@supabase-db:5432/postgres?prepare=false
```

**After (Phase B, through pooler):**
```
DATABASE_URL=postgres://app_runtime_login:...@pgbouncer:6432/postgres?prepare=false
```

Redeploy the web service:

```bash
ssh mt5vps 'cd /opt/hybrid && docker compose --env-file .env.deploy -f docker-compose.prod.yml up -d web'
```

## Sizing

| Param | Value | Reason |
|---|---|---|
| `max_client_conn` | 200 | 2–3 web instances × ~60 app-side connections |
| `default_pool_size` | 25 | 25 Postgres backends / pooler — covers ~100 concurrent clients (25 × 4 txns/conn avg) |
| `reserve_pool_size` | 5 | headroom for spikes |
| `pool_mode` | transaction | simple, no `SET` leakage, app already `prepare:false` |

**Keep app-side connection pool small** to avoid double-pooling:

In your app connection string / config, keep `pool: { min: 2, max: 10 }` — let PgBouncer be the main pool.

## Monitoring

```bash
# SSH to the box and check pooler stats
ssh mt5vps 'docker exec hybrid-pgbouncer psql -h localhost -p 6432 -U postgres -d pgbouncer -c "SHOW STATS"'

# Key metrics to watch:
# - avg_query — should be < 100 ms in transaction mode
# - avg_wait_time — spike signals saturation
# - total_query_count — throughput
```

## Troubleshooting

**Symptoms:** Web instances can't connect to the database.

```bash
# 1. Check PgBouncer is listening
ssh mt5vps 'docker logs hybrid-pgbouncer'

# 2. Verify userlist.txt is readable
ssh mt5vps 'docker exec hybrid-pgbouncer cat /etc/pgbouncer/userlist.txt'

# 3. Manually test from a web container
ssh mt5vps 'docker exec hybrid-web psql -h pgbouncer -p 6432 -U app_runtime_login -d postgres -c "select 1"'

# 4. Check if pgbouncer backend connections are open
ssh mt5vps 'docker exec hybrid-pgbouncer psql -h localhost -p 6432 -U postgres -d pgbouncer -c "SHOW CLIENTS"'
```

**Symptom:** "too many connections" error still appears.

- You may have not updated DATABASE_URL yet (still hitting Postgres directly).
- Or app-side pool is still too large — reduce it to `pool: { max: 10 }`.
- Or `reserve_pool_size` is too small — increase to 10.

## References

- [PgBouncer official docs](https://www.pgbouncer.org/)
- [SCALING_PLAN.md — Phase A/B roadmap](../../docs/SCALING_PLAN.md)
- [INFRA_SUPABASE.md — production runbook](../../docs/INFRA_SUPABASE.md)
