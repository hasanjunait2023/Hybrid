# Phase A/B Scaling Infrastructure — Ready-to-Apply Artifacts

**Created:** 2026-06-25  
**Status:** PREP — all files are templates/scripts, NOT yet applied to production  
**Approval required:** Yes — founder must review + supply secrets before deploy

---

## Files Created (10 total)

### 1. PgBouncer — Connection Pooler (Phase B prep)

**Location:** `infra/pgbouncer/`

| File | Purpose |
|---|---|
| `README.md` | Setup guide + troubleshooting (detailed) |
| `pgbouncer.ini` | Configuration template (transaction mode) |
| `userlist.txt` | Credentials template (populate from env) |
| `docker-compose-pgbouncer.yml` | Docker service definition (integrate into prod compose) |

**What founder must supply:**
- Postgres superuser password (from `/data/coolify/services/pe9o2li2n3bns3wnofob49uw/.env` → `POSTGRES_PASSWORD`)
- App runtime password (from `/opt/hybrid/.env.deploy` → `DB_POSTGRES_PASSWORD`)

**When to deploy:** Phase B, when 2+ web instances are planned. Not needed for Phase A.

**Effort:** 15 min VPS setup (extract secrets, create files, add to docker-compose).

---

### 2. Cloudflare Cache Rules + Purge (Phase A — DEPLOY NOW)

**Location:** `infra/cloudflare/`

| File | Purpose |
|---|---|
| `README.md` | Setup guide + code wiring instructions (detailed) |
| `cloudflare-cache-setup.sh` | Creates 2 cache rules via Cloudflare API (storefront + CDN) |
| `cloudflare-purge.sh` | Purges edge cache by Cache-Tag (called from app after revalidateTag) |

**What founder must supply:**
- Cloudflare API token with `Zone:Cache Purge` permission (get from https://dash.cloudflare.com → Account Settings → API Tokens)
- Cloudflare Zone ID for `hybrid.ecomex.cloud` (visible in dashboard)

**When to deploy:** Immediately (Phase A). Single biggest latency win (~50 ms edge vs ~200 ms origin).

**Code changes needed:**
1. Add `Cache-Control: s-maxage=3600` headers to storefront responses
2. Wire `cloudflare-purge.sh` into product edit handlers to purge by tenant tag
3. See `infra/cloudflare/README.md` Step 4 for exact code locations

**Effort:** 10 min API setup + 1–2 hours code wiring.

---

### 3. k6 Load Testing (Phase A baseline + ongoing validation)

**Location:** `load-test/`

| File | Purpose |
|---|---|
| `README.md` | Usage guide + interpretation of metrics |
| `storefront-load.js` | Read-only scenario: home → product → images → signup |

**What founder must supply:**
- Nothing (k6 is open-source)
- Optional: staging box URL (otherwise uses local `lvh.me:3000`)

**When to run:**
1. **Phase A baseline** — NOW, before any changes. Measure current p95 latency + error rate.
2. **After Cloudflare cache** — re-run to verify latency drop (target p95 < 250 ms with cache)
3. **Before Phase B** — confirm single VPS is saturated (p95 > 1s), triggering multi-instance need
4. **After each major change** — pooler, replica, etc.

**Usage:**
```bash
# Phase A baseline (local)
BASE_URL='http://store-a.lvh.me:3000' VUS=20 DURATION=2m k6 run load-test/storefront-load.js

# Phase A baseline (staging)
BASE_URL='https://store-a.hybrid.ecomex.cloud' VUS=50 DURATION=2m k6 run load-test/storefront-load.js
```

**Effort:** 5 min k6 install, 2 min per test run.

---

### 4. Main Scaling Infrastructure README

**Location:** `infra/README.md`

Ties all Phase A/B components together. Includes:
- What's in each directory
- Phase A vs Phase B decision framework
- Deployment checklists
- Cost breakdown
- FAQ

---

## Phase A Deployment Order (Phase A = NOW)

Do this in sequence. All safe, zero downtime, no prod restart.

```
1. Run k6 baseline (2 min)
   ↓
2. Get Cloudflare API token + Zone ID (5 min)
   ↓
3. Run cloudflare-cache-setup.sh (5 min)
   ↓
4. Code changes: Add Cache-Control headers (30 min)
   ↓
5. Code changes: Wire cloudflare-purge.sh (1 hour)
   ↓
6. Deploy code (standard zero-downtime deploy)
   ↓
7. Run k6 test again, verify p95 improvement (2 min)
   ↓
8. Monitor cache hit rate in Cloudflare dashboard (ongoing)
```

**Total time:** ~2 hours (mostly code changes).

**Expected result:** Storefront p95 latency **drops 50–70%** (from ~800ms to ~200ms on cache HIT).

---

## Phase B Deployment Order (Phase B = WHEN SINGLE VPS SATURATES)

Trigger: k6 shows p95 > 1 second or error rate climbing.

```
1. Provision 2nd web instance + load balancer
   ↓
2. Deploy PgBouncer (infra/pgbouncer/) on existing VPS
   ↓
3. Update DATABASE_URL to point to pgbouncer:6432 (not supabase-db:5432)
   ↓
4. Redeploy web instances
   ↓
5. Provision read replica (managed Postgres)
   ↓
6. Add READ_DATABASE_URL seam in @hybrid/db
   ↓
7. Wire Redis cache handler in next.config.mjs
   ↓
8. Deploy observability (Prometheus + Grafana)
```

**Total time:** ~1–2 days (code + ops).

**Not yet:** Citus sharding, ClickHouse, K8s — those are Phase C/D (only at hundreds of thousands of tenants).

---

## What Each Component Does

### Cloudflare Cache Rules
- **Rule 1:** Cache storefront HTML (`*.hybrid.ecomex.cloud`) at edge for 1 hour, honoring origin `s-maxage`
- **Rule 2:** Cache images (`cdn.hybrid.ecomex.cloud`) for 1 year (immutable)
- **Excludes:** `/admin`, `/api`, `/checkout`, `/cart` (no caching)

**Result:** 90%+ of storefront reads served from edge in < 50 ms. Origin rarely touched.

### Cloudflare Purge Script
- Purges edge cache by tenant tag when storefront is edited
- Called from app's product mutation handlers
- Per-tenant (e.g., `tenant:abc123:products` purges only store abc123's cache)

**Result:** Real-time cache invalidation without full-site purge.

### PgBouncer
- Sits between app and Postgres
- Allows N web instances to share a connection pool
- Transaction mode: one app connection = one Postgres backend per transaction (clean)

**Result:** Web scale-out doesn't exhaust `max_connections` (default 100 → can handle 200+ app connections).

### k6 Load Test
- Simulates realistic storefront traffic (home → product → images → signup)
- Measures p95 latency, error rate, throughput
- Read-only (no checkout/writes)

**Result:** Quantified baseline + proof of improvement after each phase.

---

## Secrets Checklist

**NEVER commit real values.** All scripts use environment variable placeholders:

- `CF_API_TOKEN` — Cloudflare API token (get from dashboard, 40+ char string)
- `CF_ZONE_ID` — Cloudflare zone ID (get from dashboard, ~32 char hex)
- `POSTGRES_PASSWORD` — Supabase Postgres root password (extract from `/data/coolify/.../pe9o2li2n3bns3wnofob49uw/.env`)
- `DB_POSTGRES_PASSWORD` — App runtime password (extract from `/opt/hybrid/.env.deploy`)

None of these are in the repo. Supply at deploy time via env vars or `.env.deploy`.

---

## Verification Checklist

### Phase A (after deployment)

- [ ] Cloudflare cache rules exist (visible in dashboard → Rules → Cache Rules)
- [ ] k6 shows p95 latency < 300 ms (with cache HIT)
- [ ] Cloudflare dashboard shows cache hit rate > 90%
- [ ] `curl -v https://store-a.hybrid.ecomex.cloud/ | grep cf-cache` shows `HIT` responses
- [ ] Product edits trigger cache purge (check Cloudflare Analytics for purge activity)
- [ ] No errors in app logs

### Phase B (after deployment)

- [ ] 2+ web instances are healthy (no connection exhaustion)
- [ ] PgBouncer shows connection stats (query via `docker exec` psql)
- [ ] Read replica is in sync (check `pg_stat_replication`)
- [ ] k6 shows p95 < 200 ms sustained under 100 VU load
- [ ] Error rate remains < 1%

---

## FAQ

**Q: Is Phase A required before Phase B?**  
No, but it's recommended. Phase A is free + immediate ROI. Phase B is more complex.

**Q: Will Phase A slow down the app?**  
No. Cache rules don't touch the app. Code changes are minimal (headers + purge call).

**Q: Can I test Phase A without a staging box?**  
Yes. Run k6 against local `lvh.me:3000`, and Cloudflare rules against `hybrid.ecomex.cloud`.

**Q: What if Cloudflare cache rules don't work?**  
Most common: origin not returning `Cache-Control` headers. Check with `curl -v`. See `infra/cloudflare/README.md` troubleshooting.

**Q: How much latency improvement should I expect?**  
- Cache HIT (edge): ~50 ms
- Cache MISS (origin): ~200–800 ms depending on DB query
- Expect 90%+ HIT rate after Phase A, so **effective average ~100 ms** (big win)

**Q: Do I need separate staging?**  
For Phase A: no (local testing + Cloudflare API is safe). For Phase B: yes (multi-instance + replica = more complex).

---

## References

- `docs/SCALING_PLAN.md` — detailed 10k-tenant roadmap (READ THIS FIRST)
- `docs/INFRA_SUPABASE.md` — production runbook (deployment procedures)
- `CLAUDE.md` — cache-tag scheme + stack decisions
- Cloudflare docs: https://developers.cloudflare.com/cache/
- k6 docs: https://k6.io/docs/
- PgBouncer docs: https://www.pgbouncer.org/

---

## Support

All scripts and configs have embedded documentation. Start with:

1. `infra/README.md` — overview
2. `infra/cloudflare/README.md` — Cloudflare setup
3. `infra/pgbouncer/README.md` — PgBouncer setup
4. `load-test/README.md` — k6 usage

For production issues, see `docs/INFRA_SUPABASE.md` "Gotchas (learned the hard way)" section.

---

**Author:** Claude Code (deployment engineer)  
**Date:** 2026-06-25  
**Scope:** Phase A/B scaling infrastructure (not Phase C/D)
