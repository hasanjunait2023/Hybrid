# Phase 2 — Backup & DR Report
**Date:** 2026-06-25 17:30 UTC

## ✅ COMPLETED

### Restore Drill (sandbox container)
- **Latest dump:** `db-20260625-085923.sql.gz` (51K)
- **gzip integrity:** OK
- **CREATE statements in dump:** 211
- **Sandbox restore:** Boot fresh `postgres:16-alpine` → restore → verified
- **Recovered data:** 2 tenants, 6 products, 3 app_users ✅
- **Expected errors:** Role `service_role`/`anon`/`authenticated`/`supabase_admin` don't exist in vanilla Postgres — non-fatal (these are Supabase-only roles; Hybrid data restored fully)

### Backup Status Writer
- **Script:** `/usr/local/bin/hybrid-backup-status` (on VPS) + `scripts/hybrid-backup-status.sh` (in repo)
- **Output:** `/root/backups/STATUS.json` (JSON, world-readable for monitoring)
- **Wired into backup script:** runs at end of every backup

### Backup Monitor (local-side scraper)
- **Script:** `scripts/hybrid-backup-monitor.sh`
- **Tested:** Reports `service=hybrid-backup | local_dumps=4 | size=216K | age=10.5h | r2=ok | OK`
- **Cron schedule:** `0 * * * *` (every hour)
- **Alert path:** On non-zero exit, calls `hermes notify 'Hybrid backup monitor ALERT — check VPS now'`

### MinIO Integrity
- `hybrid-media` bucket exists in MinIO but empty (correct — no tenant uploads yet)
- Mirror target `/root/backups/minio/` is empty, ready for first product image

### R2 Off-site
- 4 DB dumps in `r2://hybrid-backups/` (last sync 08:59:27 UTC)
- Lifecycle rules: managed via Cloudflare dashboard (not API-callable without API token; current retention = indefinite until manually configured)

## ⚠️ OPEN ITEMS (non-blocking)

1. **R2 lifecycle rule** — recommend setting "Delete after 90 days" via Cloudflare dashboard. Tool can't auto-set this without a Cloudflare API token with R2 write scope.
2. **MinIO bucket versioning** — currently off; enable for prod resilience.
3. **Restore drill cadence** — recommend monthly automated drill.

## 🎯 VERDICT
Backup & DR posture is solid. Restore drill proves we can recover from scratch. Monitoring in place.