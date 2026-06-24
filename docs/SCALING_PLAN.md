# Scaling Plan — 10,000 tenants / 1M requests/day, low-latency

Target: stay **fast (storefront p95 < ~150 ms, mostly < 50 ms from edge)** at **10k tenants**
and **~1M requests/day**. Note 1M/day ≈ **~12 req/s average**, with spiky BD-evening peaks of
maybe **150–400 req/s**. This is a **modest-throughput, latency-and-cache-hit problem**, NOT a
"need exotic sharding" problem. (You cannot literally hit 0 ms — network RTT to BD is tens of ms;
the lever is serving most traffic from cache/edge so the origin is rarely touched.)

## TL;DR — the good news

The **data layer is already scale-ready** and the codebase already has the right **seams**:

- RLS functions are `STABLE` (planner-cached) and hot tables have `tenant_id` composite indexes →
  RLS shared-schema scales to **hundreds of thousands** of tenants on one cluster. 10k is comfortable.
- Seams already present: per-tenant **cache-tag scheme** (`lib/storefront/data.ts`), `BlobStore`
  interface, `withTenant()` RLS path, `AUTH_PROVIDER` seam, `prepare:false` (pooler-ready), the
  FastAPI jobs service.

So scaling is **~80% infrastructure + a few code wires**, not a rewrite. **Do NOT** reach for
Citus/sharding — that's only needed at hundreds of thousands of tenants.

## Where the CURRENT architecture breaks first (bottleneck order)

Everything runs on **one 2-core / 8 GB VPS** today. It will break in this order:

1. **Single box = no horizontal scale + SPOF + CPU/RAM contention.** web + Postgres + Redis + MinIO +
   Caddy + jobs + all Supabase services share 2 cores. This saturates first.
2. **No CDN** — every storefront HTML + image is served from the one origin. The dominant traffic
   (storefront reads) has nowhere to be cached at the edge.
3. **`unstable_cache` / ISR is per-instance (in-memory)** — the moment you run 2+ web instances the
   cache fragments and `revalidateTag()` only invalidates one instance (known gap, see CLAUDE.md).
4. **No connection pooler** (we dropped Supavisor for RAM) — N web instances × pool 10 will exhaust
   Postgres `max_connections`.
5. **No read replicas** — storefront reads compete with checkout/admin writes on one primary.
6. **No load balancer / autoscale / observability** — can't add web capacity or even see what's slow.

## Target architecture

```
                 Cloudflare (DNS + CDN + cache rules + WAF)   <-- most reads end here
                          |                         |
                   cache MISS                  images (immutable)
                          v                         v
                  Load Balancer  ----------->  R2 / MinIO+CDN
                   /     |     \
              web-1   web-2   web-N   (stateless Next.js; shared Redis ISR cache)
                   \     |     /
                  Connection Pooler (Supavisor / PgBouncer, transaction mode)
                   /            \
            Postgres PRIMARY   read replica(s)   <-- storefront reads -> replicas
              (writes)                            <-- writes/checkout -> primary
                   |
            Redis (HA) — host->tenant, sessions, ISR cache, rate-limit
                   |
            Jobs workers + queue (FastAPI + arq/Redis) — courier sync, recon, SMS, webhooks
                   |
            Observability: Prometheus + Grafana + Loki + Tempo (OTel), Sentry
```

## The latency levers (what actually makes it "ms-fast")

1. **Cloudflare edge cache for storefronts (BIGGEST win).** Cache storefront HTML at the edge keyed
   by host; serve repeat visitors in < 50 ms without ever touching the origin. Purge per-tenant on
   edit via the existing cache-tag scheme + Cloudflare cache-tag/purge API. Images already at
   `cdn.hybrid.ecomex.cloud` → let Cloudflare cache them `immutable, 1y`.
2. **Shared Redis ISR cache handler** so multiple web instances share rendered output and
   `revalidateTag()` propagates (Redis pub/sub). Unblocks horizontal web scale.
3. **Connection pooler** so web scale-out doesn't exhaust DB connections.
4. **Read replicas** for storefront/analytics reads; keep the primary for writes.
5. **DB hygiene at scale**: `pg_stat_statements` to find slow queries; ensure **every** RLS-filtered
   table has a `tenant_id` index (audit — some child tables only have a parent-FK index today);
   `EXPLAIN` the hot storefront/admin queries; kill N+1 in the data layers.
6. **Keep it on the compositor/edge**: HTTP/2+3, zstd/gzip (Caddy already), small payloads, RSC/PPR
   streaming, `fetchpriority` on hero images.

## Phased roadmap (build when the trigger hits — not all at once)

### Phase A — "make the current box fast + multi-instance-ready" (do first, cheap, high ROI)
- **Cloudflare cache rules** for `*.hybrid.ecomex.cloud` storefronts + `cdn.` images. Biggest single win.
- **Redis ISR cache handler** (`@trieb.work/nextjs-turbo-redis-cache` or `@fortedigital/nextjs-cache-handler`)
  wired in `next.config.mjs` → fixes the per-instance cache gap (already a CLAUDE.md known issue).
- **Re-introduce a connection pooler** (Supavisor or PgBouncer, transaction mode; app is already
  `prepare:false`). Keep app-side pool small to avoid double-pooling.
- **`pg_stat_statements`** + a basic **Prometheus + Grafana** (node + postgres + redis exporters).
- **`tenant_id` index audit** across all RLS tables.
- **k6 load test** to find the real ceiling before guessing.

### Phase B — "decouple + add a replica" (when the box strains / first hundreds of tenants)
- **Move Postgres off the app box** — own node, or **managed** (Supabase Cloud / Neon / Crunchy /
  RDS). Managed buys HA + backups + 1-click replicas; strongly recommended at real revenue.
- **2–3 stateless web instances** behind a load balancer (Cloudflare LB or Caddy/Nginx).
- **1 read replica**; route storefront/analytics reads to it (add a `READ_DATABASE_URL` seam in
  `@hybrid/db`).
- **Redis HA** (Sentinel) or **Upstash** (managed).
- **Off-site backups** (already on the backlog) → R2/S3.

### Phase C — "10k tenants / sustained peak"
- **Autoscale web** (Fly.io / k3s / Nomad).
- **Multiple read replicas**; **partition** the largest append-heavy tables (`analytics_event`,
  `order_item`, `webhook_event`) by time (range) — not by tenant.
- **Dedicated jobs workers + real queue** (arq/Redis) for courier sync, recon, SMS, webhooks,
  exports — fully off the request path (the FastAPI service is already scaffolded for this).
- **Full observability**: OpenTelemetry tracing (Tempo), logs (Loki), SLOs + alerting, Sentry.
- **Per-tenant cache purge** wired end-to-end (cache-tags → Cloudflare + Redis).

### Phase D — ONLY if you reach hundreds of thousands of tenants (NOT at 10k)
- Horizontal DB sharding with **Citus**, or isolate whale tenants to dedicated DBs. Explicitly
  deferred — RLS shared-schema + replicas covers 10k easily.

## Tools (concrete)

| Concern | Pick | Why |
|---|---|---|
| CDN / edge / WAF | **Cloudflare** (already the DNS) | cache storefronts+images at edge; per-tenant purge; cheap |
| Connection pooler | **Supavisor** or **PgBouncer** (txn mode) | survive web scale-out without exhausting connections |
| Postgres HA / replicas | **Managed** (Neon / Crunchy / Supabase Cloud / RDS) or **Patroni** self-host | HA + read replicas + backups |
| Next.js shared cache | `@trieb.work/nextjs-turbo-redis-cache` / `@fortedigital/nextjs-cache-handler` | multi-instance ISR + `revalidateTag` via Redis pub/sub |
| Redis | **Upstash** (managed) or Redis+Sentinel | shared cache/sessions/ratelimit, HA |
| Object storage | keep MinIO or move to **Cloudflare R2** (S3-compatible, no egress) | the app's `s3` blob driver already works against either |
| Orchestration | Docker Compose → **k3s / Nomad / Fly.io** | autoscale web + workers |
| Queue | **arq** (Redis) for the FastAPI jobs | async courier/recon/SMS off the request path |
| Observability | **Prometheus + Grafana + Loki + Tempo (OTel)**, **Sentry**, BetterStack uptime | measure before optimizing |
| Load testing | **k6** | find the real ceiling, validate each phase |

## Code changes needed in THIS repo (small — seams already exist)

- `@hybrid/db`: add a **read-replica** connection (`READ_DATABASE_URL`) + a `withTenantRead()` that
  routes SELECT-only storefront queries to the replica. (`prepare:false` already set.)
- `apps/web/next.config.mjs`: register the **Redis `cacheHandler`** + `cacheMaxMemorySize: 0`.
- `apps/web/lib/storefront/data.ts`: it already uses tenant-scoped cache tags — wire **Cloudflare
  cache-tag headers + purge** alongside `revalidateTag()`.
- Storefront responses: set explicit `Cache-Control: s-maxage=...` so Cloudflare can cache.
- `apps/api` (jobs): add **arq** worker + a scheduler; move courier-sync/recon/SMS to the queue.
- Add `pg_stat_statements` to the DB and a metrics endpoint / exporters.

## SLO targets (set + monitor these)

| Surface | p95 latency | Notes |
|---|---|---|
| Storefront page | **< 150 ms** (edge hit < 50 ms) | most traffic; CDN does the heavy lifting |
| Product / cart | < 250 ms | replica reads + Redis |
| Checkout (write) | < 500 ms | primary; idempotent `placeOrder` already |
| Admin pages | < 400 ms | replica reads where safe |
| API/job triggers | < 300 ms enqueue | actual work is async |

Error budget + alerting on these. Track cache hit-rate (target storefront > 90% edge), DB p99,
pooler saturation, Redis latency.

## Cost / ops reality

The single self-hosted VPS is great **now** (cheap, full control) but **cannot** serve the target
load — the first real move is **decoupling Postgres** (managed or its own HA node). At 10k paying
tenants, managed Postgres (HA + replicas + backups) is usually worth more than the DBA time to run
Patroni yourself. Everything else (web, Redis, jobs, CDN) scales cheaply and incrementally.

> Sources: Supabase RLS perf best practices; Postgres RLS-at-scale (STABLE functions + indexed
> policy columns); Supavisor/PgBouncer transaction-mode pooling; Next.js 15 multi-instance
> cacheHandler (Redis pub/sub); PlanetScale/ClickHouse multi-tenant Postgres scaling (read replicas
> → partition → isolate → shard-last). See chat for links.
