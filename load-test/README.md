# Load Testing — Phase A/B infrastructure prep

**Status:** Phase-A infrastructure prep — use to validate performance before/after scaling changes.

## Purpose

k6 load tests the storefront under realistic traffic, measuring latency and error rates. Helps you:

1. **Find the real ceiling** of the current single-VPS setup (useful data for Phase B trigger)
2. **Validate each phase** — re-run after deploying cache / pooler / replicas to measure improvement
3. **Test staging/dedicated boxes** safely, without touching production

## Prerequisites

Install k6: https://k6.io/docs/getting-started/installation/

**Ubuntu/Debian:**
```bash
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3232A
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**macOS:**
```bash
brew install k6
```

**Windows (with chocolatey):**
```powershell
choco install k6
```

## Usage

### Basic run (dev defaults)

```bash
k6 run load-test/storefront-load.js
```

Defaults: 5 virtual users, 30 seconds duration, against `http://store-a.lvh.me:3000` (local).

### Staging environment (Phase A)

```bash
BASE_URL='https://store-a.hybrid.ecomex.cloud' VUS=10 DURATION=2m k6 run load-test/storefront-load.js
```

Parameters:
- `BASE_URL` — storefront URL (default: local)
- `VUS` — virtual users (default: 5)
- `DURATION` — how long to maintain peak load (default: 30s)

### Heavy load test (before Phase B)

```bash
BASE_URL='https://store-a.hybrid.ecomex.cloud' VUS=100 DURATION=5m k6 run load-test/storefront-load.js
```

This ramps up to 100 concurrent users over 10s, sustains for 5 minutes, then ramps down.

## What it tests

The test is **read-only** — exercises the storefront as real customers would:

1. **Home page load** — fetches `GET /`
2. **Product detail** — extracts a product link and fetches `GET /products/{slug}`
3. **Static assets** — images and styles
4. **Marketing page** — `GET /signup`

No checkout, no writes — so it stresses the cache, read path, and CDN, not the database write path.

## Metrics

At the end of a run, you'll see:

```
════════════════════════════════════════════════════════════════
   K6 LOAD TEST SUMMARY
════════════════════════════════════════════════════════════════

   HTTP Request Duration
   avg: 250.45 ms
   p(95): 850.32 ms       <-- 95th percentile (key metric)

   Error Rate: 0.50%
   Total Requests: 1240

   Thresholds
   ✅ http_req_duration{staticAsset:false}: p(95)<1000
   ✅ http_req_failed: rate<0.1

════════════════════════════════════════════════════════════════
```

**Key metrics:**

| Metric | Target (Phase A) | Notes |
|---|---|---|
| `p(95)` latency | < 1 second | 95% of requests finish in 1s |
| `avg` latency | < 250 ms | average across all requests |
| Error rate | < 10% | measure of stability under load |
| cache hit rate | > 90% (view in Cloudflare) | CDN doing its job |

## When to run

1. **Phase A baseline** — run against the current single VPS to establish the ceiling
   ```bash
   BASE_URL='https://store-a.hybrid.ecomex.cloud' VUS=50 DURATION=2m k6 run load-test/storefront-load.js
   ```

2. **After deploying Cloudflare cache rules** — latency should drop significantly (cache HIT)

3. **After deploying the pooler** — error rate should stay near 0 as web instances scale

4. **Before Phase B** — validate the single box is saturated and it's time to add instances

## Interpreting results

### Latency increasing → p95 > 1s

**Cause:** The box is saturated (CPU/disk/RAM contention). Either:
- The storefront query is slow (profile in `pg_stat_statements`)
- The app-side connection pool is exhausted (watch `postgresql_stat_activity`)
- Cache is not working (verify Cloudflare cache hit % in dashboard)

**Action:** Profile the bottleneck. See `docs/SCALING_PLAN.md` "DB hygiene at scale".

### Error rate increasing → > 10%

**Cause:** Likely connection exhaustion or OOM. The single VPS can't handle this load.

**Action:** This is your trigger for Phase B. Add a second web instance with PgBouncer.

### p95 < 250 ms consistently

**Good news:** You have headroom. The box can take more load before you need to scale.

## Advanced: Save results to a file

```bash
k6 run load-test/storefront-load.js --summary-export=results.json
```

Then analyze with jq:

```bash
jq '.metrics.http_req_duration' results.json
```

## Before running on STAGING

⚠️ **WARNING: Do NOT run this on the production single-VPS box** (yet — Phase A is gathering data).

- If you own a **staging box**, run there.
- If you own **Fly.io / Render credits**, spin up a staging version.
- If local + `lvh.me`, use defaults (safe).

Once Phase B is approved and multi-instance web is deployed, you can safely load-test production because:
- Load is spread across instances
- PgBouncer prevents connection exhaustion
- Cloudflare edge absorbs most reads

## Integration with CI/CD

Example GitHub Actions workflow to run after each deploy:

```yaml
- name: Load test staging
  run: |
    k6 run load-test/storefront-load.js \
      --vus 50 \
      --duration 1m \
      --out json=k6-results.json
    # Fail CI if p95 > 1s
    jq 'if .metrics.http_req_duration.value > 1000 then error("p95 too high") else empty end' k6-results.json
```

## References

- [k6 official docs](https://k6.io/docs/)
- [SCALING_PLAN.md — Phase A/B roadmap](../docs/SCALING_PLAN.md)
- [INFRA_SUPABASE.md — production runbook](../docs/INFRA_SUPABASE.md)
