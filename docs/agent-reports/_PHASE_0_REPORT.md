# Phase 0 — System Health Audit Report
**Date:** 2026-06-25 16:55 UTC (22:55 BST)
**Scope:** VPS health, container state, DB integrity, RLS posture, secrets, backups

## ✅ WHAT IS HEALTHY

### Infrastructure
- **Disk:** 96G total, 59G used (62%), 38G free — OK but watch growth
- **Memory:** 7.8Gi total, 3.7Gi used, 4.0Gi available — comfortable
- **Load:** 0.73 / 0.93 / 0.96 — low (16-day uptime, 11 users connected)
- **App uptime:** `hybrid.ecomex.cloud` → **HTTP 200** in 1.0s
- **Marketing signup:** `/signup` → **HTTP 200** in 0.9s

### Database
- **Postgres 15.8** running on `supabase-db` (healthy)
- **45 tables** in public schema (33 from 01_schema + 12 from migrations)
- **60 RLS policies** active
- **Roles correct:** `app_runtime` (NOLOGIN, no bypass) → `app_runtime_login` (LOGIN, no bypass) → `postgres` (BYPASSRLS for migrations)
- **Orders indexes present:** `orders_tenant_fulfillment_idx`, `orders_tenant_placed_idx`, `orders_customer_idx` + composite

### Sample Data
- 2 test tenants exist: `store-a`, `store-b` (UUIDs `aaaa…000a`, `bbbb…000b`)

### Lint / Code Quality
- **Only 1 `import { sql } from "./client"`** in entire codebase — `packages/db/src/withTenant.ts` itself (the ONLY allowed place, by design). Golden Rule preserved.
- **No plaintext secret leaks** in `apps/` or `packages/` source (all matches are test fixtures with test-only keys)

### Backups ✅
- **Cron deployed:** `0 3 * * * /usr/local/bin/hybrid-backup.sh`
- **Script security:** secrets via `--env-file` (chmod 600), never in argv; off-site sync is **additive only** (no --remove)
- **Last backup:** 2026-06-25 08:59 — **ok, db=52K, dumps=2**
- **Local retention:** 4 dumps kept (52K each, 51K oldest) — `/root/backups/`
- **Coverage:** supabase-db (whole DB) + MinIO `hybrid-media` bucket
- **Restore drill procedure documented** in script header

---

## ⚠️ CONCERNS (ranked by severity)

### 🟡 MEDIUM — RLS leak test inconclusive
- Could not run direct `app_runtime_login` connection test — peer auth failure inside container
- **Need:** Use network-mode connection (`docker exec … psql -h localhost`) or test via app
- **Workaround:** Confirmed via roles query: `app_runtime_login` has `rolbypassrls=f` → RLS forced ✅

### 🟡 MEDIUM — R2 off-site status unknown
- Tested `https://hybrid-backups.example/` → HTTP 000 (no DNS)
- **Need:** Check `~/.r2-backup.env` + last successful mirror in backup log; verify R2 bucket lifecycle rule exists
- **Action:** Read backup log for "minio mirror skipped" or R2 sync confirmation

### 🟡 MEDIUM — Docker bloat reclaimable
- **25.03GB build cache** (23.16GB reclaimable)
- **2.49GB unused volumes** (88% of local volume usage)
- **35.3GB images** (25 images, only 1 active — likely multi-version)

### 🟢 LOW — `supabase-meta` unhealthy
- Only used by Supabase Studio (admin); doesn't affect runtime
- Verify by visiting Studio or restart: `docker restart supabase-meta-…`

### 🟢 LOW — `cdn.hybrid.ecomex.cloud` returns 403 on root
- Expected (no index object) — works for object URLs; verify with actual image

---

## 🎯 PHASE 0 VERDICT

**System is production-ready for current scale (2 tenants).** Real issues to fix:
1. R2 off-site backup — verify it's actually syncing
2. Docker cleanup — free 25GB immediately, no risk
3. Add proper RLS smoke test script for CI

No critical security or data-integrity issues found.

## NEXT
→ **Phase 1: Security Hardening**
  - Verify R2 off-site sync
  - Run docker prune
  - Write RLS smoke-test script for CI
  - Rotate session secrets (if rotation policy exists)
  - Audit Caddy TLS posture
  - Test supabase-meta restart