# Infrastructure — Phase A/B Scaling Prep

**Status:** All artifacts below are **infrastructure prep — NOT YET APPLIED to production**. Each requires founder approval before deploy.

This directory contains ready-to-apply configs and scripts for scaling Hybrid from the current single-VPS (~10–100 tenants, ~10 req/s) to **Phase A/B capacity** (~1000 tenants, ~100 req/s, multiple web instances).

Reference: [`docs/SCALING_PLAN.md`](../docs/SCALING_PLAN.md) (detailed scaling roadmap) and [`docs/INFRA_SUPABASE.md`](../docs/INFRA_SUPABASE.md) (production runbook).

## What's in here

### `pgbouncer/` — Connection Pooler

**Why:** Enables 2+ web instances to share a Postgres connection pool without exhausting `max_connections`.

**What founder must supply:**
- Supabase Postgres password (from `/data/coolify/.../pe9o2li2n3bns3wnofob49uw/.env`)
- App runtime password (from `/opt/hybrid/.env.deploy`)

**Phase trigger:** When deploying 2+ web instances (Phase B)

**Files:**
- `README.md` — detailed setup + troubleshooting
- `pgbouncer.ini` — configuration template (transaction mode)
- `userlist.txt` — credentials template
- `docker-compose-pgbouncer.yml` — Docker service definition

**Approx. effort:** 15 min setup on the VPS.

---

### `cloudflare/` — Edge Cache Rules + Purge

**Why:** Cache storefront HTML at Cloudflare edge (50 ms vs 200 ms from origin). Single biggest latency win in Phase A.

**What founder must supply:**
- Cloudflare API token (with `Zone:Cache Purge` permission)
- Cloudflare Zone ID for `hybrid.ecomex.cloud`

**Phase trigger:** Immediately (Phase A) — free money latency improvement.

**Files:**
- `README.md` — detailed setup
- `cloudflare-cache-setup.sh` — creates cache rules via API
- `cloudflare-purge.sh` — purges edge cache by tag

**Code changes needed:**
- Add `Cache-Control` headers to storefront responses
- Call `cloudflare-purge.sh` after `revalidateTag()` (per-tenant cache invalidation)
- See `cloudflare/README.md` "Step 4" for exact locations

**Approx. effort:** 10 min setup + 1–2 hours code wiring.

---

### `../load-test/` — k6 Load Testing

**Why:** Measure the single VPS's real ceiling before Phase B. Run after each scaling change to validate improvement.

**What founder must supply:**
- Nothing — k6 is open-source
- Optionally: staging box URL or use local `lvh.me:3000`

**Phase trigger:** Phase A baseline (now), then after each major change (pooler, cache, replicas).

**Files:**
- `storefront-load.js` — read-only scenario (home, product, images, signup)
- `README.md` — usage examples, metric interpretation

**Approx. effort:** 5 min to install k6, 2 min per test run.

---

## Phase A vs Phase B at a glance

| Phase | Focus | New infra | Code changes | Founder time |
|---|---|---|---|---|
| **A** | "Faster + multi-instance-ready" | Cloudflare cache rules + pooler (optional) + load test | Add Cache-Control headers + cache-tag purge wiring | ~2–3 hours |
| **B** | "Decouple + scale" | Separate DB + load balancer + read replica | Add `READ_DATABASE_URL` seam + Redis cache handler | ~1–2 days (code + ops) |

## Deployment checklist

### Phase A (do first, immediately)

- [ ] **Cloudflare cache rules** (`infra/cloudflare/`)
  - [ ] Obtain API token + Zone ID
  - [ ] Run `cloudflare-cache-setup.sh`
  - [ ] Add `Cache-Control` headers to storefront (code)
  - [ ] Wire `cloudflare-purge.sh` into product edit handlers (code)
  - [ ] Verify cache hit rate > 90% in Cloudflare dashboard

- [ ] **k6 load test baseline** (`load-test/`)
  - [ ] Install k6
  - [ ] Run test against staging / single VPS
  - [ ] Record p95 latency + error rate
  - [ ] After cache goes live, re-run and verify improvement

- [ ] **PgBouncer (optional prep)** (`infra/pgbouncer/`)
  - [ ] Extract Supabase + app passwords
  - [ ] Create `/opt/pgbouncer/userlist.txt` and `pgbouncer.ini`
  - [ ] Test locally (do NOT switch DATABASE_URL yet)
  - [ ] Keep ready for Phase B

### Phase B (when single box strains)

Trigger: p95 latency > 1s or error rate climbing.

- [ ] **Deploy second web instance** (behind load balancer)
  - [ ] Update `docker-compose.prod.yml` for 2+ web services
  - [ ] Redeploy

- [ ] **Activate PgBouncer** (`infra/pgbouncer/`)
  - [ ] Update `DATABASE_URL` to point to pgbouncer:6432 (not supabase-db:5432)
  - [ ] Redeploy web

- [ ] **Wire Redis cache handler** (code)
  - [ ] Update `apps/web/next.config.mjs` to register cache handler
  - [ ] Deploy + verify `revalidateTag()` propagates across instances

- [ ] **Add read replica** (DB layer)
  - [ ] Provision managed replica (Neon / Crunchy / RDS)
  - [ ] Add `READ_DATABASE_URL` env var
  - [ ] Implement `withTenantRead()` seam in `@hybrid/db`
  - [ ] Route storefront/analytics reads to replica

- [ ] **Observability** (Prometheus + Grafana)
  - [ ] Enable `pg_stat_statements` on Postgres
  - [ ] Deploy node + postgres + redis exporters
  - [ ] Set up Grafana dashboards
  - [ ] Define SLO alerts (p95 < 150ms, error < 1%)

## What NOT to do (yet)

These are **Phase C/D** decisions — premature at 10k tenants:

- ❌ **Citus sharding** — RLS shared-schema + replicas covers 10k easily
- ❌ **ClickHouse** — only needed when analytics-events dominate (Phase C)
- ❌ **pgvector** — feature track, not a latency lever (off the hot path)
- ❌ **Full Kubernetes** — Fly.io / k3s works fine for Phase B; K8s is Phase C overkill

## Current production setup (baseline)

- **Host:** 72.62.228.196 (Ubuntu 24.04, 2vCPU / 8GB RAM)
- **App:** self-hosted Supabase on Docker
- **Stack:** hybrid-web + hybrid-redis + hybrid-jobs + supabase-db + supabase-minio + caddy
- **DB:** Postgres 15 in-Docker (no replication)
- **CDN:** Cloudflare DNS (no cache rules yet)
- **Concurrent capacity:** ~10–50 users before saturating CPU/RAM

## Resources

- **Scaling roadmap:** [`docs/SCALING_PLAN.md`](../docs/SCALING_PLAN.md)
- **Production runbook:** [`docs/INFRA_SUPABASE.md`](../docs/INFRA_SUPABASE.md)
- **CLAUDE.md (cache-tag scheme):** [`CLAUDE.md`](../CLAUDE.md)

## FAQ

**Q: Can I deploy Phase A without Phase B?**
Yes. Cloudflare cache rules + k6 baseline are safe and immediate. PgBouncer is prep but not required yet.

**Q: When do I trigger Phase B?**
When load test shows p95 > 1 second or you're planning to add a 2nd web instance anyway. Not before.

**Q: How much will this cost?**
- Cloudflare cache rules: free (already on free tier)
- PgBouncer: free (lightweight, runs on existing VPS)
- Managed Postgres (Phase B): ~$50–100/month (Neon / Crunchy)
- Load testing: free (k6 is open-source)

**Q: Do I need to take downtime for Phase A?**
No. Cache rules are applied at Cloudflare (no restart). Code changes can be deployed with standard zero-downtime deploys.

**Q: What if Phase A doesn't help?**
Profile with k6 + Cloudflare dashboard. If cache hit rate is low, the code isn't setting Cache-Control headers correctly. If latency is still high, the bottleneck is in the DB (slow queries, RLS overhead, missing indexes) — see `SCALING_PLAN.md` "DB hygiene at scale".

## Next steps

1. **Read** `docs/SCALING_PLAN.md` in full — understand the latency levers
2. **Run** load test (`load-test/`) against staging to establish baseline
3. **Deploy** Cloudflare cache rules (`infra/cloudflare/`) + wire code
4. **Re-run** load test and celebrate the win
5. **Monitor** cache hit rate + latency. When p95 > 1s, trigger Phase B.

Good luck!
