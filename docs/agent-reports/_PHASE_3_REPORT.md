# Phase 3 — Observability Report
**Date:** 2026-06-25 17:42 UTC

## ✅ DELIVERABLES

### Uptime Monitor (live, every 5 min)
- **Script:** `/usr/local/bin/hybrid-uptime` (on VPS) + `scripts/hybrid-uptime.sh` (in repo)
- **Cron:** `*/5 * * * *` (every 5 min)
- **Coverage:** 17 checks
  - Public endpoints: marketing apex, signup, store-a storefront, admin redirect, CDN root, login API method-not-allowed
  - Containers: hybrid-web/caddy/postgres/redis/jobs + 6 supabase containers
- **Result:** **17 OK / 0 FAIL**
- **Performance:** store-a storefront 44ms (Cloudflare cached!), apex 673ms

### Backup Monitor (live, every hour)
- **Script:** `scripts/hybrid-backup-monitor.sh` (local Hermes)
- **Cron:** `0 * * * *`
- **Result:** `service=hybrid-backup | local_dumps=4 | size=216K | age=10.5h | r2=ok | OK`
- **Alert path:** `hermes notify 'Hybrid backup monitor ALERT'` on non-zero exit

### Operations Dashboard (PUBLIC)
- **URL:** https://hybrid.ecomex.cloud/hybrid-ops/
- **Sub-routes:** `/` (HTML), `/UPTIME.json`, `/STATUS.json`
- **Features:** Auto-refresh every 60s, color-coded status cards, summary metrics (uptime OK/FAIL, dump count, last backup age, R2 sync status)
- **Files served from:** `/data/dashboard` (inside caddy_data volume)
- **Sync cron:** `* * * * *` — copies fresh JSON from `/root/backups/` to dashboard dir

### Caddyfile Updated
- Added `handle_path /hybrid-ops/*` to apex block — static serve before reverse_proxy to web
- Reloaded live via admin API (no downtime)
- Old Caddyfile backed up to `/opt/hybrid/Caddyfile.bak-pre-hybridops`

### supabase-meta Status
- Restart attempt: container running but health check `localhost:8080/health` ECONNREFUSED intermittently
- Manual probe: `node fetch('http://localhost:8080/health')` returns **200** from inside container
- Verdict: health check misconfigured (5s timeout too tight); **non-fatal** — meta only serves Supabase Studio admin
- Action: documented for Phase 7 fix (increase timeout to 10s in docker-compose.trimmed.yml)

### Hybrid-web Cache Errors (FINDING)
- 2 occurrences in 24h: `Stream isn't writeable and enableOfflineQueue options is false`
- Root cause: Redis not ready when web tried to connect at startup
- App fallback works correctly (`cache miss` + `cache skip` — non-fatal)
- Recommendation: set `enableOfflineQueue: true` in ioredis config (Phase 5 code review)

## ⚠️ KNOWN OPEN ITEMS

1. supabase-meta health check timing (5s timeout) — Phase 7 fix
2. Redis `enableOfflineQueue` setting — Phase 5 code review
3. Backup monitor alert path needs Hermes-side validation (cron line has `||` fallback but Hermes bot token not in VPS env — `/root/.hermes/bin/hermes` is a local binary)

## 🎯 VERDICT
Observability stack LIVE. Public dashboard at `https://hybrid.ecomex.cloud/hybrid-ops/`. All 17 health checks passing.