# APIS_SCALE_RESEARCH — Scale Patterns for a Bengali-First Commerce SaaS

**Audience:** audit context for **Hybrid** — Bengali-first, mobile-first multi-tenant
commerce SaaS ("Shopify for Bangladesh"). Self-hosted Supabase (Postgres 15) on a single
8 GB VPS at `72.62.228.196` with Coolify-generated stack (db, kong, auth, rest,
storage, minio, imgproxy, meta, studio). Cache layer: local `hybrid-redis`. Async:
FastAPI service + queue. Live deployment since 2026-06-25. Phase 1 + Phase 2 (M3)
complete; Phase A/B scaling infra (PgBouncer, Cloudflare cache, k6 loadtest) PREPPED
NOT YET APPLIED. See `/root/Hybrid/CLAUDE.md` for the current state and
`/root/Hybrid/SCALING_PREP_SUMMARY.md` for the prepared artifacts.

**Scope:** This document is research-only. No implementation. Each section ends with
an **Implication for Hybrid (audit-readiness)** note that ties the industry finding to
Hybrid's actual current size.

**Method / honesty:**
- All citations are URL-formatted so each can be re-fetched.
- ⚠️ **Tool caveat:** for this session the `web_extract` backend was search-only
  (DuckDuckGo rejected every URL extract). Every quote was therefore taken from the
  `web_search` snippet for the URL, not from a full-page read. Several sub-agents
  documented the same caveat; URLs themselves are real but the full page text was
  not loaded. Confidence ratings reflect that.
- Where industry data is genuinely not public (e.g. Shopify's exact per-pod shop
  count, internal DB tenancy of BigCommerce/Lightspeed), the document says so
  explicitly and does NOT invent numbers.

---

## 0. Snapshot of Hybrid's current scale (ground-truth)

| Scale dimension | Current value | Source in this repo |
|---|---|---|
| Tenants (merchants) | Single-digit to low dozens (early live — Phase 1/2 just shipped) | `/root/Hybrid/CLAUDE.md`, `_PHASE_*_REPORT.md` |
| Customers | Tens to low hundreds across live merchants | same |
| Infra | **1 VPS** (8 GB RAM), Docker, Coolify | `CLAUDE.md` "PRODUCTION DEPLOYMENT" |
| Database | Self-hosted Supabase Postgres 15, `public` schema, RLS via `app.current_tenant_id`, **two-role split** (`app_runtime_login` INHERIT from NOLOGIN `app_runtime`) | `CLAUDE.md` "Two-role split" |
| Cache | Single `hybrid-redis` (ioredis) | `CLAUDE.md` LOCKED stack |
| Search/queue | FastAPI service + BullMQ-style queue, single instance | `CLAUDE.md` LOCKED stack |
| CDN | Cloudflare wildcard → Caddy → origin (no edge-cache rules yet) | `infra/cloudflare/` prepared but unapplied |
| Observability | Self-hosted (no Sentry/Datadog/OTel collector configured publicly) | inferred; not in CLAUDE.md |
| Realtime | Self-hosted Supabase had Realtime **dropped** in Coolify trimmed compose | `CLAUDE.md` "Supabase stack" |
| Load testing | `load-test/storefront-load.js` prepared | `SCALING_PREP_SUMMARY.md` |

**Net:** Hybrid is **pre-scale**, not pre-architecturally-prepared. Every
recommendation below is sized to a single VPS that has not yet seen hundreds of
concurrent merchants or tens of thousands of orders. All "100K merchants"
benchmarks in this document are *prior art* — they tell us what to plan for, not what
Hybrid has hit.

---

## 1. Multi-tenant DB patterns

### 1.1 The industry taxonomy
AWS and Microsoft both group SaaS tenancy into the same three patterns:

| Pattern | Also called | Isolation | Cost | Ops complexity |
|---|---|---|---|---|
| **Silo** | schema-per-tenant, DB-per-tenant | Highest (own DB / schema) | Highest | Highest |
| **Pool** | shared schema + `tenant_id` column + RLS | Lowest | Lowest | Lowest |
| **Bridge** | hybrid: pool default, silo for premium/regulated tenants | Selective | Middle | Middle |

> "These patterns fall into one of three categories — silo, bridge, and pool."
> — AWS Well-Architected SaaS Lens, https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/silo-pool-and-bridge-models.html

> "The Silo Model … provides the strongest tenant isolation but incurs the most
> cost and complexity. Inversely, the Pool Model offers the least tenant isolation but
> costs the least."
> — AWS Guidance for Multi-Tenant Architectures on AWS,
> https://docs.aws.amazon.com/solutions/multi-tenant-architectures-on-aws/

Microsoft's Azure SQL guidance uses the same taxonomy
(https://learn.microsoft.com/en-us/azure/azure-sql/database/saas-tenancy-app-design-patterns?view=azuresql).

**Cross-check:** Hunchbite — "Multi-Tenant SaaS Architecture: Row-Level Security vs…"
— https://hunchbite.com/guides/multi-tenant-saas-architecture
agrees on the taxonomy and enumerates the same pool-side cost/isolation trade-offs.

**Confidence: HIGH** — three independent vendor-authored sources agree on the
silo/pool/bridge taxonomy.

### 1.2 What big players actually do

| Vendor | Pattern | Source | Confidence |
|---|---|---|---|
| **Shopify** | Silo at the DB layer — **Pod Architecture**: each pod = one MySQL shard + Redis + Memcached + cron. Merchants grouped into pods, not shared-schema-by-default. Recently moving to Vitess + Yugabyte for global write scaling. | https://shopify.engineering/horizontally-scaling-the-rails-backend-of-shop-app-with-vitess ; https://shopify.engineering/scaling-inventory-reservations ; https://sujeet.pro/articles/shopify-pod-architecture | **HIGH** for pod architecture; Shopify does NOT publish the exact per-pod shop count (honest gap). |
| **Salesforce / Commerce Cloud** | Pool — "shared tenancy, metadata-driven." Public architect docs call it the "apartment building" model. | Salesforce Architects — https://architect.salesforce.com/docs/architect/fundamentals/guide/platform-multitenant-architecture.html ; https://admin.salesforce.com/blog/2025/the-apartment-analogy-making-sense-of-salesforces-multitenant-architecture ; "fully managed multi-tenant SaaS" framing at https://oroinc.com/b2b-ecommerce/blog/bicommerce-vs-salesforce-commerce-cloud/ | **HIGH** for shared-with-metadata-tenancy; the underlying per-row RLS vs per-org schema split inside Salesforce's "metadata" tenant store is NOT publicly detailed (honest gap). |
| **VTEX** | Pool — explicitly "single multi-tenant SaaS infrastructure where OMS, marketplace, B2B, CMS share one data model." | https://dev.vtex.com/en-us/assets/interactive-architecture/ ; https://aws.amazon.com/blogs/apn/vtex-built-a-cost-per-tenant-strategy-e-commerce-platform-on-aws/ ; https://www.linkedin.com/pulse/fortress-skyscraper-brent-w-peterson-lalic | **MEDIUM** — confirmed by VTEX dev site and AWS partner blog; full primary engineering source for the DB column-vs-schema split was not extracted. |
| **BigCommerce** | "Multi-storefront with shared catalog" — public docs describe a *product* model not a *DB* model. Internal DB tenancy (shared table by `store_id`? schema-per-store?) is not publicly disclosed. | https://docs.bigcommerce.com/developer/learn/courses/catalog-rest-api/overview/catalog-api ; https://digitalroxy.com/bigcommerce-multi-storefront-seo-architecture-domains-catalogues/ | **LOW** for the DB-internal split — honest gap. |
| **Lightspeed** | Public materials describe the "Light Speed Framework" multi-tenant features; no primary engineering source on the DB tenancy model was retrieved. | https://www.lightspeedsolutions.com/Multi-Tenant/ | **LOW** — honest gap. |

**Net for industry pattern choice:**
- **Shopify = silo (pod/shard by merchant grouping).** Scale ceiling: petabytes.
- **Salesforce = pool with metadata tenant store.** Scale ceiling: hundreds of thousands of orgs.
- **VTEX = pool.** Scale ceiling: tens of thousands of merchants.
- **BigCommerce / Lightspeed = no public DB detail (likely pool).**

**What "hybrid does big players do?"** Two of five (Shopify, BigCommerce) trend silo;
the other three (Salesforce, VTEX, Lightspeed) trend pool. There is no single
canonical answer for "100K+ merchants and millions of customers."

### 1.3 When does shared-schema break at scale?

Three failure modes recur across the literature:

**(a) Noisy neighbour.** "The noisy neighbor problem will surface at ~500–1000 tenants.
By then, retrofitting isolation is expensive."
— AddWeb Solution — https://www.addwebsolution.com/blog/multi-tenant-performance-crisis-advanced-isolation-2026
*"A single tenant running a large report can degrade performance for all tenants on the system."*
— Notixit — https://notixit.com/blog/multi-tenant-saas-architecture-scaling
**Confidence: LOW–MEDIUM** — the 500–1000 number is vendor-blog heuristic, not a measured benchmark. The qualitative claim is well-supported.

**(b) Schema-per-tenant catalog bloat.** "Postgres wasn't designed to handle 10,000
schemas with 50 tables each. Postgres stores metadata about every table, column,
and index in its internal catalogs…"
— loke.dev — https://loke.dev/blog/multi-tenant-postgres-performance-killers
**Confidence: MEDIUM–HIGH** for the mechanism (well-known Postgres catalog pressure);
the specific "10,000 schemas" threshold is one vendor blog. The lesson — don't grow
into schema-per-tenant — is the consensus.

**(c) Lock-contention during migrations / `pg_upgrade`.** Schema-per-tenant
multiplies the number of objects to lock, ALTER, reindex. Migrations must lock N
tables instead of 1.
— MonPG — https://monpg.app/blog/postgresql-multitenant-schema-design
**Confidence: HIGH** that this is a real operational pain, MEDIUM on the exact N where
it bites.

### 1.4 Postgres RLS at scale — the single biggest Supabase-specific footgun

The most-cited performance footgun on Supabase RLS is calling auth helpers like
`auth.uid()` **without** wrapping them in a subquery. The unwrapped call evaluates
**once per row**; the wrapped call `(select auth.uid())` is promoted by Postgres to
an `InitPlan` that runs **once per statement**:

> "Another method to improve performance is to wrap your RLS queries and functions in
> select statements. This method works well for JWT functions like `auth.uid()`…"
> — Supabase Docs — RLS Performance and Best Practices,
> https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv
> Cross-check: https://github.com/orgs/supabase/discussions/14576

The Supabase advisor lints for this exact pattern:
> "Improperly written RLS policies can cause these functions to execute once-per-row,
> rather than once-per-query."
> — https://supabase.com/docs/guides/database/database-advisors?lint=0003_auth_rls_initplan

A widely-cited third-party benchmark: "170ms → under 0.1ms (99.78% improvement)"
— https://zenn.dev/cosoado/articles/supabase-rls-auth-uid-perf
**Confidence: HIGH** for the InitPlan-wrapping technique; **MEDIUM** for the specific
benchmark number (third-party blog citing Supabase's benchmarks).

**Other Supabase-specific RLS pitfalls:**
- **Pool-leak footgun with `SET` + transaction pooler.** Supabase explicitly warns:
  "Don't create session variables with a transaction pooler (port 6543)… If you
  must create session variables, it is better to avoid shared poolers and instead
  use Supavisor in session mode or direct connections."
  — https://github.com/orgs/supabase/discussions/40593
  This is **directly relevant to Hybrid** because Hybrid uses
  `app.current_tenant_id` set per-request. `SET LOCAL` inside an explicit
  transaction is the safe pattern; non-`LOCAL` `SET` is the footgun.
- **Realtime RLS is a separate bottleneck.** "This quickly becomes a performance
  bottleneck when the number of changes, or number of subscribers, is large."
  — https://supabase.com/blog/realtime-row-level-security-in-postgresql
  Hybrid has dropped Realtime from the Coolify trim, so this is moot today, but
  matters if Realtime is re-introduced later.
- **RLS can disable indexes.** DBA threads and the Bytebase writeup document cases
  where RLS causes the planner to drop an index.
  — https://dba.stackexchange.com/questions/342601/help-understand-why-rls-significantly-affects-query-performance ;
  — https://www.bytebase.com/blog/postgres-row-level-security-footguns/
  Mitigation: put `tenant_id` as the leading column of every composite index that
  is queried per-tenant.

**Real CVE reminder:** "CVE-2025-48757 … 10.3% of analyzed Lovable apps shipped
with Supabase tables readable by anyone holding the anon key."
— https://vibeappscanner.com/supabase-row-level-security
**Confidence: MEDIUM** — third-party reporting; not directly traced to NVD in this
session. Reinforces the "RLS is sacred" rule Hybrid's CLAUDE.md already enforces.

### 1.5 Path forward at scale (when pool+RLS isn't enough)

- **Bridge model:** move premium/regulated tenants to dedicated schemas while the
  majority stay on shared. Recommended by AWS's prescriptive guidance and the
  Hunchbite guide.
- **Citus (Microsoft):** the same `tenant_id` column you already have can become
  a Citus distribution column, sharding rows by tenant without leaving the Postgres
  SQL surface.
  > "Citus lets you keep normal PostgreSQL semantics — schemas, joins, constraints,
  > transactions — while horizontally scaling by sharding tables across worker
  > nodes."
  > — https://learn.microsoft.com/en-us/postgresql/citus/tutorial-multi-tenant?view=citus-14
  — https://docs.citusdata.com/en/stable/use_cases/multi_tenant.html
- **Future:** Multigres = Vitess for Postgres (Sugu Sougoumarane, ex-YouTube,
  joined Supabase June 2025) — explicitly a multi-year Postgres horizontal-scaling
  project. Not adoptable today.
  — https://supabase.com/blog/multigres-vitess-for-postgres

### 1.6 Implication for Hybrid (current size)

Hybrid is already on **pool + RLS** via `withTenant()` and `app.current_tenant_id`.
This is the right starting point for a single-VPS SaaS — endorsed by AWS and
Microsoft for SaaS.

**Concrete fixes that should be applied *now* (Phase A) regardless of scale:**
1. **Audit every RLS policy for `auth.uid()` and any function call. Wrap in
   `(select …)` subqueries** so Postgres promotes them to InitPlans.
2. **Verify every `withTenant()` call uses `SET LOCAL` (or `select set_config('app.current_tenant_id', $1, true)`) inside an explicit transaction.** Supabase's own
   discussion #40593 is explicit: non-`LOCAL` `SET` on a transaction-mode pooler is
   the multi-tenant leak vector.
3. **All composite indexes on tenant-scoped tables must start with `tenant_id`.**

**Phase B / future planning trigger:** revisit pool+RLS if Hybrid crosses ~500–1000
active merchants OR if any single merchant's query visibly hurts others (noisy
neighbour). Plan A then: bridge model for the top 5% of merchants. Plan B: single-node
Citus with `tenant_id` distribution column.

---

## 2. API Gateway / Rate Limiting

### 2.1 Shopify — documented limits

**REST Admin API** uses a **per-(app, store) leaky bucket**:
- **Bucket = 40 requests**, **leak rate = 2 req/s**.
- Header: `X-Shopify-Shop-Api-Call-Limit` returns current/max (e.g. `32/40`).
- Source: https://shopify.dev/docs/api/admin-rest/usage/rate-limits
- Cross-check #1 (Shopify Partners Blog): "In the case of the REST Admin API, they're allotted a bucket size of 40 requests." https://www.shopify.com/partners/blog/rate-limits
- Cross-check #2 (independent): "The REST Admin API … bucket size here is 40 requests, with a leak rate enabling 2 requests per second." https://praella.com/blogs/shopify-insights/understanding-shopify-api-rate-limiting-a-comprehensive-guide
- Cross-check #3: "Each app/store combination is given a bucket of 40 requests." https://codup.co/blog/shopify-api-rate-limits-optimization/
- **Confidence: HIGH** for 40/2 req/s on REST.

**GraphQL Admin API** uses **calculated cost points**:
- Scalar = 0 points, object = 1, connection = 2 + 1/item, mutation = 10 (third-party restatement of docs).
- Per-query cap: ≤ 1,000 points.
- Standard plans: bucket = **1,000 points**, refill = **50 points/s**.
- Plus plans: bucket = **2,000 points**, refill = **100 points/s**.
- Response carries `extensions.cost.throttleStatus { maximumAvailable, currentlyAvailable, restoreRate }`.
- Source: https://shopify.dev/docs/api/admin-graphql/latest.txt ; https://shopify.dev/docs/api/admin-graphql
- Cross-check: https://www.lunar.dev/post/a-developers-guide-managing-rate-limits-for-the-shopify-api-and-graphql
- **Confidence: HIGH** for cost-point model, 1,000 cap, 50/100 restore rates.

**429 behaviour:**
> "If an app reaches API rate limits for a specific resource, then it receives a 429
> Too Many Requests response, and a message that a throttle has been applied."
> — https://shopify.dev/docs/api/usage/limits
- `X-Shopify-Shop-Api-Call-Limit` header remains `1/40` on the throttled response.
- **Retry-After header:** Shopify docs do NOT document Retry-After. Community thread
  confirms the header is absent; clients must compute backoff from the bucket drain
  rate themselves.
  — https://community.shopify.com/t/x-shopify-shop-api-call-limit-for-throttled-requests-429-too-many-requests-has-value-1-40/66951
- **Confidence: HIGH** for 429 presence; **MEDIUM** for "no Retry-After" — absence
  is documented but no explicit "we don't send" statement was retrieved.

**Leaky-bucket official statement:**
> "The basic principles of the leaky bucket algorithm apply to all our rate limits,
> regardless of the specific methods used to apply them."
> — https://shopify.dev/docs/api/usage/limits

### 2.2 BigCommerce

- **Default REST rate limit:** 20 requests/second; 5,000 requests/hour per store.
  — https://docs.bigcommerce.com/developer/docs/overview/api-fundamentals/rate-limits ; cross-checked at https://moldstud.com/articles/p-how-to-gracefully-handle-api-rate-limits-in-your-bigcommerce-application
- **Enterprise "Unlimited" plan:** "… does not impose rate limits by request magnitude per unit of time. However, there are physical infrastructure-related constraints…"
  — https://docs.bigcommerce.com/developer/docs/overview/api-fundamentals/integration-design
- **429 (rate-limit) is explicitly documented.** 503 (origin overload) is mentioned.
- **Confidence: HIGH** for 20 req/s + 5,000 req/hour standard plan; **LOW–MEDIUM** for "5 concurrent requests per store" (third-party only, not verified on `developer.bigcommerce.com`).

### 2.3 Stripe

**Rate-limiter architecture (multi-pronged):**
> "At Stripe, we operate 4 different types of limiters in production. The first one,
> the Request Rate Limiter, is by far the most important one… We use the token bucket
> algorithm to do rate limiting. This algorithm has a centralized bucket host where you
> take tokens on each request, and slowly drip more tokens into the bucket."
> — https://stripe.com/blog/rate-limiters

The four limiters are: (1) Request Rate, (2) Concurrent in-flight, (3) Load Shedder,
(4) a fourth (see blog). Stripe chose **token bucket** with Redis as the bucket host
(third-party restatement: https://vinay199129.github.io/system-design-zth/case-studies/p2-rate-limiting-01-stripe-token-bucket/).
**Confidence: HIGH** for token bucket + multi-limiter design (Stripe's own blog).

Stripe does **not publish a hard numeric API rate cap** — it varies by endpoint and
traffic class. Third-party "100 req/s" figures (e.g. https://www.reform.app/blog/api-rate-limits-impact-form-integrations) are **LOW** confidence.

DDoS: Stripe does not publicly disclose which upstream (Cloudflare / AWS) they lean on;
the rate-limiter architecture IS their published DDoS posture.

### 2.4 Rate-limiting algorithm zoo (cross-source)

| Algorithm | Burst handling | Memory | Fairness | Industry usage |
|---|---|---|---|---|
| Fixed Window Counter | Poor (boundary burst) | O(1) | Coarse — up to 2× burst | Cloudflare basic, AWS WAF rate-based |
| Sliding Window Log | None — exact | O(N) | Excellent | Rare at scale |
| Sliding Window Counter | Smooths boundary burst | O(1) | Good approx | Cloudflare advanced, NGINX |
| **Token Bucket** | Bounded burst | O(1) | Good | **Stripe**, AWS API Gateway, NGINX, Envoy |
| **Leaky Bucket** | Smooths to constant rate | O(1) | Strict pacing | **Shopify** (officially) |

Sources: https://stripe.com/blog/rate-limiters ; https://redis.io/tutorials/howtos/ratelimiting/ ;
https://medium.com/swlh/rate-limiting-fdf15bfe84ab ; https://ratelimit.arunavasircar.com/

**Why it matters:** Leaky bucket (Shopify) protects downstream from spikes with a
strict output rate. Token bucket (Stripe) lets clients optimize for the common case
and burst for rare cases. For a Bengali-first commerce SaaS admin backend that
*protects its own database*, leaky bucket per merchant is the safer default.

### 2.5 DDoS protection for SaaS

- **Cloudflare Spectrum** — "extends Cloudflare's enterprise-grade DDoS protection
  and performance optimization to any TCP or UDP application." Enterprise only.
  — https://reintech.io/blog/utilizing-cloudflare-spectrum-for-non-http-service-protection
- **Cloudflare Magic Transit** — IP-layer / BGP-advertised DDoS protection (Enterprise).
  — https://www.facebook.com/Cloudflare/posts/magic-transit-customers-can-now-program-their-own-ddos-mitigation-logic-and-depl/1408184971338218/
- **AWS Shield** — Standard free for all AWS customers; Advanced adds dedicated
  response + cost protection.
  — https://www.radware.com/cyberpedia/ddospedia/best-ddos-protection-services-top-8-solutions-in-2025/
- **Cloudflare Q4 2024 DDoS report:** "Cloudflare mitigated another record-breaking
  DDoS attack peaking at 5.6 Tbps. Overall, Cloudflare mitigated 21.3 million DDoS
  attacks in 2024, representing a 53% increase compared to 2023."
  — https://blog.cloudflare.com/ddos-threat-report-for-2024-q4/

### 2.6 Implication for Hybrid (current size)

Hybrid is **already on Cloudflare wildcard** (per `CLAUDE.md`). What's missing is
edge-cache rules and any application-layer rate limit.

**Recommended order (Phase A → B):**
1. **Cloudflare Free + edge-cache rules** (already prepared in `infra/cloudflare/`).
   Free tier covers the DDoS surface for a startup; defer Shield/Spectrum/Magic
   Transit to enterprise pricing later.
2. **Per-merchant leaky bucket on the admin API**, modelled on Shopify REST. Defaults:
   bucket = 40 req, leak = 2 req/s per merchant. Backing store: existing `hybrid-redis`.
   Library: pre-built `@limiter` style middleware (Lua-atomic `INCR + EXPIRE` in
   Redis; or a small wrapper around `generic-rate-limiter` style token bucket).
3. **For GraphQL/admin endpoints**, adopt cost-point model. Assign each resolver a
   static cost based on touched tables; pre-flight check against bucket; return 429
   with `Retry-After: <seconds>` (Hybrid should emit this header even though Shopify
   doesn't, because Hybrid's clients are internal + easier to coordinate).
4. **Webhook ingestion endpoints** (bKash/Nagad callbacks, courier status webhooks):
   strict per-source rate + signature verification. 5xx on burst past threshold to
   force upstream retry with backoff.

---

## 3. WebSocket scaling

### 3.1 Slack — primary case study

Slack terminates its millions of concurrent WebSockets at a service called **wss**:
> "The websocket connections are ingested into a system called 'wss' (WebSocket
> Service)… Slack has a global customer base, with millions of simultaneously
> connected users at peak times."
> — https://slack.engineering/migrating-millions-of-concurrent-websockets-to-envoy/

Slack migrated from HAProxy to **Envoy** as the WS gateway:
- HTTP/2 + WebSocket bootstrap (RFC 8441) lets the edge terminate the TCP/TLS
  connection, then upgrade to a multiplexed stream.
- This decouples "TLS termination" from "logical channel" — Slack can restart gateway
  pods without dropping clients.
— Same source. Hacker News discussion: https://news.ycombinator.com/item?id=26476894

**Socket Mode** (Slack's app-side WebSocket product) lets third-party apps consume
Slack Events without exposing a public HTTP URL:
> "Socket Mode allows your app to use the Events API and interactive features —
> without exposing a public HTTP Request URL. Instead of sending payloads to a
> public endpoint, Slack will use a WebSocket URL."
> — https://docs.slack.dev/apis/events-api/using-socket-mode/

**Confidence: HIGH** for the wss-service name and Envoy migration (Slack's own blog).

### 3.2 Redis pub/sub vs dedicated WS service

**Self-hosted Redis pub/sub** is the low-cost primitive:
> "A typical architecture consists of a WebSocket server for handling client
> connections, backed by Redis as the Pub/Sub layer for distributing new
> messages… this is key to distributing load on our service."
> — https://ably.com/blog/scaling-pub-sub-with-websockets-and-redis

**Caveat (also from Ably, a competitor):** Redis pub/sub is fire-and-forget. If a
subscriber disconnects, the message is lost. No replay, no per-channel ordering
across reconnects.

**Managed services** (Ably, Pusher, PubNub) provide multi-region, replay, ordering,
per-channel history. Ably claims:
> "1.5 billion daily WebSocket connections across 11 datacenters"
> — https://blog.mattheworiordan.com/p/scaling-websockets-to-billions-of

**Practical rule:**
- Single-region, ≤ a few thousand sockets, fire-and-forget OK: Redis pub/sub +
  sticky sessions.
- Multi-region, guaranteed delivery, presence + history: managed service.
— Cross-source synthesis; corroborated at https://websocket.org/guides/websockets-at-scale/

### 3.3 Backpressure, heartbeat, reconnection

- **Heartbeat / ping:** every WS framework (Next.js, ws, socket.io, Pusher protocol)
  ships with ping/pong. Industry default is 25–30 s ping, 10 s pong timeout.
- **Backpressure:** drop on full send queue + apply server-side flow-control by
  limiting per-client send rate. Slack/Socket Mode implements backpressure by closing
  slow clients.
- **Reconnection:** exponential backoff with jitter, client-side. Server-side: keep
  the WS keyed by `connection_id` so the new socket resumes from a stored cursor /
  last-message-id rather than re-fanning history.
- Cross-source for connection-management patterns:
  https://ably.com/blog/scaling-pub-sub-with-websockets-and-redis ;
  https://dev.to/ably/scaling-pubsub-with-websockets-and-redis-5b2c
  **Confidence: MEDIUM** — these patterns are textbook and consistent across Ably,
  Pusher, and Socket.IO docs, but no single "industry standard" document was
  retrieved.

### 3.4 What Hybrid actually needs

Hybrid **dropped Supabase Realtime** in the Coolify trim (`CLAUDE.md`). The current
real-time requirements for a commerce SaaS are limited:
- Order-status push to merchant admin (low fanout).
- Cart abandonment nudge (cron-driven email/notification, not WS).

A simple **Self-hosted Redis pub/sub + sticky-session WS** on the single VPS is
**sufficient** until any of: (a) >10K concurrent open sockets, (b) cross-region
needed, (c) presence/typing indicators needed.

**Implication for Hybrid (current size):**
- Today: don't add WS infra. Use Next.js Server-Sent Events for the limited
  admin-side push needs.
- Future: if WS becomes a requirement, use Redis pub/sub + sticky sessions, with an
  explicit plan to migrate the WS gateway (à la Slack's HAProxy→Envoy swap) rather
  than embed WS in the Next.js app.

---

## 4. Queue / Async processing

### 4.1 System landscape

| System | Language/runtime | Use case | Confidence |
|---|---|---|---|
| **Sidekiq** | Ruby, Redis-backed | Shopify uses it | **HIGH** — https://sidekiq.org/ says "scale to thousands of processes and billions of jobs per day"; Shopify engineering blog discusses Sidekiq limits: https://shopify.engineering/high-availability-background-jobs |
| **BullMQ** | Node, Redis Streams | Closest match to Hybrid's FastAPI+Node stack | **HIGH** — https://bullmq.io/ ; https://docs.bullmq.io/ ; https://github.com/taskforcesh/bullmq |
| **AWS SQS** | Managed, Standard or FIFO | At-least-once (Standard) vs exactly-once (FIFO with TPS limits) | **HIGH** — https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-fifo-queues.html ; https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-exactly-once-processing.html |
| **Google Pub/Sub** | Managed | At-least-once default; exactly-once opt-in with ordering | **HIGH** — https://docs.cloud.google.com/pubsub/docs/exactly-once-delivery ; https://docs.cloud.google.com/pubsub/docs/lease-management |

### 4.2 What moves off the request path

The canonical commerce examples:
- **bKash / Nagad reconciliation** — webhook (server-to-server, IP-allowlisted) hits
  the merchant's tenant; push a **durable** job to queue for state reconciliation
  with retries (avoid duplicate status pushes via idempotency key).
- **Courier sync (Steadfast, Pathao, REDX, Paperfly)** — webhook handler does
  signature verify + enqueue; worker calls courier API + writes to DB.
- **Order confirmation emails** — push to queue, worker pulls SMTP creds and sends.
- **Image resizing / CDN variants** — push to queue, worker dispatches to imgproxy.
- **Bulk CSV imports** — always async.

The general rule: **anything that calls a third-party API that doesn't return in
<100ms belongs off the request path.**

The community-maintained Laravel package https://packagist.org/packages/kejubayer/steadfast-api-integration
and the GitHub topic https://github.com/topics/steadfast-api
confirm webhook-based delivery-status sync is the established pattern for BD couriers.
**Confidence: HIGH** for the webhook-based architecture; **MEDIUM** for any specific
courier webhook payload schema (primary `steadfast.com.bd` docs were not extracted).

> ⚠️ Honest gap: I could NOT retrieve bKash/Nagad primary engineering docs in this
> session (search snippets didn't surface `developer.bka.sh` pages). Treat their
> technical specifics as unverified — Hybrid needs to confirm from the provider's own
> docs before committing to retry/webhook timing.

### 4.3 Idempotency keys — Stripe as the canonical reference

> "Idempotency keys are up to 255 characters long… You can remove keys from the
> system automatically after they're at least 24 hours old. We generate a new request
> if a key is reused after the original is pruned. The idempotency layer compares
> incoming parameters to those of the original request and errors if they're not the
> same to prevent accidental misuse."
> — https://docs.stripe.com/api/idempotent_requests

Cross-check: Stripe CLI uses the same `--idempotency-key` flag with a 24-hour dedup window.
— https://docs.stripe.com/cli/post

For API v2, the dedup window extends to **30 days**.
— https://docs.stripe.com/api-v2-overview

> "The Stripe API guarantees the idempotency of GET and DELETE requests, so it's
> always safe to retry them."
> — https://docs.stripe.com/error-low-level

GET/DELETE-safe guarantee is **HIGH** confidence, primary source.

Square Payments API follows the same pattern (docs at https://developer.squareup.com/docs/build-basics/common-api-patterns/idempotency), **HIGH** confidence for shape but the exact retention window was not retrieved.

> ⚠️ Honest gap: Amazon Pay primary idempotency spec was not retrieved this session.

### 4.4 Idempotency table pattern (Postgres)

Standard implementation:
```sql
CREATE TABLE idempotency_key (
  key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_hash BYTEA NOT NULL,
  response_body JSONB,
  status_code INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (key, endpoint)
);
CREATE INDEX … ON idempotency_key (created_at); -- for cleanup
```
- Pre-insert: `INSERT … ON CONFLICT DO NOTHING RETURNING …` — if a row came back,
  this is the first attempt; otherwise read the existing `response_body`/`status_code`
  and replay verbatim.
- TTL sweep: delete rows older than the dedup window (Stripe v1 = 24 h).

### 4.5 Implication for Hybrid (current size)

Hybrid's FastAPI service already has a queue (per `CLAUDE.md`'s "Async / heavy jobs:
FastAPI service + queue"). The research validates the choice of a Redis-backed
queue (BullMQ on Node, or a Python equivalent like `arq` / `taskiq`) over a managed
SQS-equivalent at this scale.

**Concrete additions that should be applied in Phase A:**
1. **Idempotency table** with the schema above, on every money-touching write path
   (payment capture, refund, order state transition).
2. **Webhook handler pattern**: HTTP-200-on-enqueue, 5xx-on-queue-failure, never do
   work inline.
3. **Retry with exponential backoff + jitter**, max-attempts cap, then DLQ.
4. **Tag every async job with `tenant_id`** so observability can show per-merchant
   job health — critical for a multi-tenant SaaS.

---

## 5. Caching strategy

### 5.1 Patterns

Five canonical cache patterns (well-established textbook):
| Pattern | Latency profile | Consistency | Trade-off |
|---|---|---|---|
| **Cache-aside** (most common in commerce) | Read: cache hit = fast, miss = origin | Eventual | App responsible for invalidation |
| **Write-through** | Read fast; write = cache then origin | Strong | Write-latency hit |
| **Write-behind** | Read fast; write = cache, async origin | Eventual | Risk of data loss on cache eviction |
| **Read-through** | Cache-as-code; cache populates on miss | Eventual | App treats cache as data store |
| **Write-around** | Write bypasses cache | Eventual | Cache miss on first read after write |

Sources: https://codelit.io/blog/caching-patterns-write-through-aside-behind ;
https://www.cacheinvalidation.org/advanced-cache-invalidation-patterns-synchronization/write-through-vs-write-behind-caching/
**Confidence: MEDIUM-HIGH** on pattern definitions; multiple independent authors agree.

For Hybrid: **cache-aside** is the right default for storefront reads (product
listings, category trees, merchant settings). Write-through only for price/inventory
where consistency matters more than write latency.

### 5.2 Per-tenant cache invalidation

Two foundational patterns:
- **Cache key includes tenant id** (e.g. `tenant:<id>:product:<pid>`). Purging one
  tenant's stale data means `SCAN`-ing or maintaining per-tenant index sets.
- **Surrogate-Key / Cache-Tag header** (Fastly pioneered) or Cloudflare equivalent
  for tag-based purge: tag = `tenant-<id>` or `product-<id>`, then purge by tag.

For **per-merchant invalidation in Hybrid's `infra/cloudflare/` plan**: emit
`Cache-Tag: tenant-<tenant_id>` (or `product-<product_id>` for product pages).
Cloudflare Enterprise supports tag purges; for the Pro plan, prefix-based purge is
the fallback.

### 5.3 CDN edge caching for storefronts

- **Vercel ISR** = stale-while-revalidate at the edge:
  > "ISR serves cached static pages while regenerating content in the background."
  > — https://vercel.com/docs/incremental-static-regeneration
  > "ISR follows the stale-while-revalidate pattern."
  > — https://blog.kuutar.de/https/vercel.com/docs/incremental-static-regeneration
  **Confidence: HIGH** (primary source)
- **Cloudflare** = Cache + Workers KV (eventually-consistent KV per PoP):
  — https://developers.cloudflare.com/cache/
  — https://developers.cloudflare.com/cache/how-to/purge-cache/
  — Workers KV: https://developers.cloudflare.com/kv/examples/cache-data-with-workers-kv/
- **Fastly Surrogate-Key** is the canonical tag-purge primitive:
  > "Setting a Surrogate-Key header on a response from a backend server tells
  > Fastly to index that response against the specified key… can be used to target
  > the content for purging."
  > — https://www.fastly.com/documentation/reference/http/http-headers/Surrogate-Key/
  > https://www.fastly.com/documentation/guides/full-site-delivery/purging/purging-with-surrogate-keys/
  **Confidence: HIGH** (two Fastly-controlled sources + SDK reference)

### 5.4 Cache stampede prevention

antirez himself (Redis creator):
> "Prevent multiple clients from simultaneously regenerating an expired cache key
> using locking, probabilistic early refresh, or request coalescing. A cache
> stampede… occurs when a popular cache key expires, causing many concurrent requests
> to simultaneously query the database to regenerate the value."
> — https://redis.antirez.com/fundamental/cache-stampede-prevention.html

Three canonical techniques (cross-source consensus):
1. **Distributed lock** (Redis `SET NX EX`).
2. **Request coalescing / singleflight** (in-process, future map).
3. **Probabilistic early expiration / XFetch** (Vattani et al., 2015).

Cross-sources: Go singleflight article https://dev.to/serifcolakel/cache-stampede-in-go-preventing-thundering-herds-with-singleflight-stale-caching-and-request-2ho6 ;
Python singleflight https://github.com/GriffinCanCode/stampede-cache ;
TTL jitter writeup https://oneuptime.com/blog/post/2026-01-21-redis-cache-stampede/view ;
synthesis https://www.contentbuffer.com/guides/cache-stampede-beat-thundering-herd-redis
**Confidence: HIGH** for the three-technique consensus (multiple independent sources).

### 5.5 Redis vs in-process

In-process caches (`functools.lru_cache`, Caffeine in Java, Node `lru-cache`, Go
`ristretto`) are ~10× faster than Redis (no network hop). They are NOT safe for:
- Webhook deduplication (lost on restart).
- Cache shared across multiple Next.js / FastAPI worker processes.
- Cross-region read coherence.

**Right primitive for Hybrid:** in-process LRU for **per-request** caching (e.g.
memoising the same DB query inside one request). Redis for **shared** caching
(product, category, storefront pages, idempotency table, rate-limit bucket).

### 5.6 Implication for Hybrid (current size)

Phase A infra (already prepared in `/root/Hybrid/infra/cloudflare/`) sets up:
1. Two Cloudflare cache rules — one for storefront pages, one for CDN assets.
2. A `cloudflare-purge.sh` script called from product/edit handlers via
   `revalidateTag`/`Cache-Tag`.
3. `s-maxage=3600` Cache-Control on storefront responses.

**Concrete additions for Phase A:**
1. **Use cache-aside as the default.** Don't write-through prices; do invalidate-on-write.
2. **Stampede mitigation: Redis `SET NX EX` lock + TTL jitter** for storefront
   product/category cache. (Important for the BD market where a single viral
   product can hit origin thousands of times per minute.)
3. **In-process LRU cache for request-scoped memoisation** (e.g. RLS helpers, per-
   request configuration lookups).

---

## 6. Observability

### 6.1 What big platforms measure

Three pillars: **RPS, p99 latency, error budget.**
- **RPS** (requests per second) at the edge / per service. Public numbers vary wildly:
  - Shopify: third-party blog claims 489 M req/min (https://blog.waelouf.com/post/blog/shopify-bbg/) — **LOW** confidence (single source).
  - StackShare summary: 80k RPS — https://www.engineering.fyi/article/e-commerce-at-scale-inside-shopify-s-tech-stack-stackshare-io — **LOW** confidence.
  - Slack: 2.3 M QPS across Vitess — https://sujeet.pro/articles/slack-distributed-architecture — **LOW** confidence (secondary).
- **p99 latency** (production page). Industry guidance: 5-minute aggregation window
  is a "widely used default" because 1-min windows have low quantile accuracy and
  15-min windows slow detection.
  — https://devcheolu.com/en/posts/hKM3U0ABxvj76PKYaFSP
- **Error budget** = allowable unreliability within an SLO. Defined by the Google
  SRE book; relayed in https://sreschool.com/blog/error-budgets-a-complete-guide/

> ⚠️ Honest gap: I did not retrieve the Google SRE Book chapters or vendor-published
> p99 numbers (Shopify/Cloudflare/Vercel) this session. Treat the public RPS
> numbers as LOW confidence; rely on the *technique* (SLO + burn rate) not the
> *value*.

### 6.2 Tooling

- **Sentry** — "end-to-end distributed tracing, enabling developers to identify and
  debug performance issues and errors." Pricing (per third-party aggregators):
  Developer free → Team $26/mo → Business $80/mo.
  — https://docs.sentry.io/ ; https://docs.sentry.io/product/sentry-basics/performance-monitoring/
  Pricing snippets: https://aitoolpick.org/blog/sentry-pricing-2026/ (LOW confidence on price, HIGH on capability).
- **Datadog** — Per-host $15/mo Pro / $23/mo Enterprise + separate cost lines for
  logs, APM, custom metrics. **HIGH** confidence on the model; per-host and per-
  metric numbers as cited: https://www.aiclouddatapulse.com/datadog-cost/ (LOW
  confidence on exact dollar values).
- **Honeycomb** — Purpose-built columnar observability store; SLO model originates
  from Google SRE book.
  — https://www.honeycomb.io/platform/distributed-tracing ; https://docs.honeycomb.io/notify/slos
  > ⚠️ Honest gap: Honeycomb's per-event pricing was not retrieved this session.
- **OpenTelemetry** — open standard for traces/metrics/logs. "Open source observability
  framework for cloud native software."
  — https://opentelemetry.io/docs/concepts/observability-primer/ ; https://opentelemetry.io/

### 6.3 Structured logging — baseline format

> "Most log aggregation tools including ELK, Loki, and Datadog are designed for
> structured JSON logs. Key fields to include in every log entry are timestamp in
> ISO 8601 format, level such as DEBUG, INFO, WARN, ERROR, or FATAL, service name,
> message which is a human-readable description, and correlation ID for request
> tracing."
> — https://techyall.com/tutorial/logging-best-practices

Loki architecture (Grafana docs):
> "Grafana Loki has a microservices-based architecture and is designed to run as a
> horizontally scalable, distributed system… optimised for label-based indexing of
> log streams (Prometheus-style)."
> — https://grafana.com/docs/loki/latest/get-started/architecture/

**Confidence: HIGH** for the JSON-log baseline (multiple independent sources).

### 6.4 Implication for Hybrid (current size)

Hybrid does NOT have Sentry/Datadog/OTel configured publicly per `CLAUDE.md`. A
production commerce SaaS cannot run without these for long.

**Concrete additions for Phase A:**
1. **Add Sentry** (Developer free, → Team $26/mo when event volume justifies).
   SDKs in both the Next.js app and the FastAPI queue worker.
2. **Structured JSON logging** with at minimum: `timestamp` (ISO 8601), `level`,
   `service` (e.g. `hybrid-web`, `hybrid-fastapi`), `tenant_id` (always — for
   multi-tenant drilldowns), `request_id` (correlation), `user_id`.
3. **OTel-compatible tracing** on critical paths: storefront checkout, payment
   capture, webhook ingestion, queue worker execution. Export to either Sentry
   or a self-hosted OTel collector.
4. **p99 latency SLO on storefront TTFB** (target: <300 ms with Cloudflare cache,
   <800 ms origin) and **error budget burn-rate alerts**.
5. **Per-tenant dashboards.** Most useful single metric: requests/sec + p99 by
   `tenant_id`. Surfaces noisy-neighbour patterns before they cascade.

---

## 7. Database scalability

### 7.1 PgBouncer modes and the `search_path` CVE

- **Transaction pooling** (default for OLTP): "A server connection is assigned to
  a client only during a transaction." Breaks session-bound features: prepared
  statements, SET, advisory locks, temp tables, **LISTEN/NOTIFY**.
  — https://www.pgbouncer.org/features.html
- **Session pooling**: preserves all session-level state but gets almost no
  multiplexing. Use only where session-state matters.
- **Pitfall:** prepared-statement "already exists" errors under transaction mode.
  — https://opensource-db.com/how-we-solved-prepared-statement-issues-with-pgbouncers-pooling-modes/
- **Pitfall:** "NOTIFY/LISTEN doesn't work with Transaction Pooling, only with
  Session Pooling."
  — https://github.com/pgbouncer/pgbouncer/issues/655
- **CVE-2025-12819** (PgBouncer ≤ 1.24.x): "an unauthenticated attacker can
  execute arbitrary SQL during authentication by providing a malicious `search_path`
  parameter in the StartupMessage." Patch to PgBouncer ≥ 1.25.1.
  — https://www.pgbouncer.org/

**Confidence: HIGH** on these (cross-checked: official PgBouncer site + GitHub issues
+ independent practitioner write-ups).

### 7.2 Supavisor (the Supabase-blessed pooler)

> "Supavisor is a scalable, cloud-native Postgres connection pooler. A Supavisor
> cluster is capable of proxying millions of Postgres end-client connections into a
> stateful pool of native Postgres database connections."
> — https://github.com/supabase/supavisor

Key advantages over raw PgBouncer:
- **Named prepared statement support** (fixes PgBouncer's biggest gotcha).
- **Query load balancing** across read replicas.
- **Query cancellation** through the pooler.

Published benchmark:
> "1,003,200 concurrent client connections · 20,000+ QPS · 400 tenant Postgres
> connections · ~50% CPU utilization (pool owner node) · 7.8G RAM usage on a 2-node
> 64 vCPU / 246 RAM cluster."
> — https://github.com/supabase/supavisor

**Implication:** On self-hosted Supabase via Coolify, Supavisor is already in the
stack (per Supabase self-host docs at https://supabase.com/docs/guides/self-hosting/docker).
Hybrid should verify it's enabled and configured — its transaction mode still has the
prepared-statement + SET caveats, so Session mode is the safer default for
`withTenant()` traffic.

### 7.3 `max_connections` — defaults and tuning

- Postgres default `max_connections = 100`.
  — https://www.postgresql.org/docs/current/runtime-config-connection.html
- Default `superuser_reserved_connections = 3`, set at server start.
- "The default limit of 100 connections can quickly become insufficient…"
  — https://thelinuxcode.com/tuning-postgres-max-connections/
- Practical guidance: OLTP pool size 20–30 for an 8 GB box.
  — https://dev.to/geekyfox90/postgresql-connection-pooling-with-pgbouncer-a-complete-guide-2fam
  **Confidence: HIGH** for defaults (official PG docs); MEDIUM for the 20–30 OLTP
  recommendation (practitioner article).

### 7.4 Read replicas

Official terminology:
> "Servers that track changes in the primary are called standby or secondary
> servers… one that can accept connections and serves read-only queries is called
> a hot standby server."
> — https://www.postgresql.org/docs/current/high-availability.html

**Replication lag is the contract.** The replica is always a little behind,
milliseconds to seconds. If a user writes to the primary and immediately reads the
replica, they may see the old state.
— https://amirulislamalmamun.com/practice/data-engineering/071-read-replicas-and-replication-lag/ ;
— https://itemscv.com/en/blog/postgresql-read-replica-practical-guide

**Read-after-write in commerce:** route the user's own session to primary (or use
a sticky-read-after-write token). Real production failure mode: "Read Replicas —
Lag Caused 400 Double Charges."
— https://thecodeforge.io/database/read-replicas-postgresql/

Supavisor can route queries to read replicas:
— https://github.com/supabase/supavisor

### 7.5 Sharding triggers (what big platforms did, NOT a "shard at N" number)

| Platform | Triggers sharding at… | Source |
|---|---|---|
| **Shopify** | Implicit (pod balancing as MySQL shards fill). No published threshold. | https://shopify.engineering/mysql-database-shard-balancing-terabyte-scale |
| **Slack** | Migrated active-active MySQL to Vitess at scale → "now handles 99% of Slack's query load" at ~2.3 M QPS. | https://slack.engineering/scaling-datastores-at-slack-with-vitess/ |
| **Discord** | Messages: 12 Cassandra nodes (2017) → 177 nodes (2022). Trigger = dataset no longer fits one machine + hot keys dominate. | https://discord.com/blog/how-discord-stores-trillions-of-messages |
| **YouTube** | Origin story of Vitess. | https://www.usenix.org/conference/lisa12/vitess-scaling-mysql-youtube-using-go |

**Consensus rule-of-thumb (cross-source synthesis, NOT a vendor number):** a single
Postgres node becomes painful somewhere between **~1 TB of hot-row-write data** and
**~10⁵–10⁶ sustained writes/sec**. Treat as heuristic, not as a published number.
— Cross-source synthesis only; no single primary citation.

> ⚠️ Honest gap: I could not retrieve a published "shard at N GB" or "shard at N
> tenants" threshold from any big platform's engineering blog. The closest primary
> source remains Slack's "Active-active MySQL → Vitess" decision narrative.

### 7.6 Vertical partitioning (hot tables)

> "By using partitioning, you can split data into custom-sized chunks… for time-
> series data, you can partition for ranges such as hourly, daily, weekly, monthly,
> quarterly, yearly, custom, or any combination of these."
> — https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL_Partitions.html

**`pg_partman`** is the production-cited extension:
- "As of version 5.0.1, only built-in, declarative partitioning is supported and the
  older trigger-based methods have been deprecated."
- https://github.com/pgpartman/pg_partman

**Recommended per-table strategy for a commerce SaaS (practitioner synthesis):**

| Table | Strategy | Reason |
|---|---|---|
| `orders` | LIST/HASH by `tenant_id` (multi-tenant) OR RANGE by `created_at` (archival). Composite key best. | Tenant locality + archival |
| `order_line_items` | **Same partition strategy as `orders`** so joins don't cross shards. | Referential locality |
| `audit_logs` | RANGE by `created_at` (daily or weekly). `pg_partman` auto-create. Cold-archive old. | Append-only time-series |

— Synthesis of https://www.postgresql.org/docs/current/ddl-partitioning.html ; https://github.com/pgpartman/pg_partman ; https://medium.com/@bhaveshyasharma/table-partitioning-in-postgresql-a-complete-guide-d770e7144bce
**Confidence: HIGH** for time-range partitioning as the textbook answer.

### 7.7 Implication for Hybrid (current size)

Order of operations, sized to a single 8 GB VPS:

| Now (Phase A) | Trigger | Layer to add |
|---|---|---|
| ✅ Supabase + RLS already in place | Day 1 | — |
| Verify Supavisor or add PgBouncer in **session mode** (Hybrid uses SET LOCAL + transaction, so *transaction mode is the footgun* — pre-flight the prepared-statement pattern in `withTenant()`). | When FastAPI workers + web workers + admin clients > ~30 connections. | PgBouncer session mode OR Supavisor session mode |
| Add `(select auth.uid())`-style wrapping to all RLS policies | Day 1 audit | RLS hotfix |
| Verifying every composite index starts with `tenant_id` | Day 1 | Index hotfix |
| TLS-trust the webhook signature on every courier + payment webhook | Day 1 | Webhook handler refactor |

| Phase B (when… ) | Trigger condition | Layer |
|---|---|---|
| PgBouncer in transaction mode | FastAPI workers > 20 OR public web traffic > ~50 RPS | Connection pooler with `SET LOCAL` discipline |
| Cloudflare Pro ($20/mo) | Cross-region latency > 200 ms OR want advanced WAF | CDN upgrade |
| Single-VPS → second VPS for FastAPI workers | CPU > 70% sustained OR p99 origin > 800 ms | Horizontal app scaling |
| Read replica | Dashboard/reporting/analytics read QPS > 50% of total | Streaming-replication hot standby + Supavisor load balancing |
| RANGE partition on `audit_logs` | > 100 GB audit_logs OR > 1 year of retention | `pg_partman` daily/weekly partitions |
| List/HASH partition on `orders` | > 10⁶ orders in single tenant OR > 10⁸ total | Native partitioning by `tenant_id` |
| Citus sharding | Single node > 1 TB hot-row writes OR > 10⁵ writes/sec | Citus extension on same Postgres |
| Multigres / Vitess | Cross-region write replication, planetary scale | Supabase Multigres (still maturing) |

---

## 8. Cost realistic checkpoints

This section consolidates §2–§7 into a single trigger matrix for a Bengali-first
commerce SaaS on a single 8 GB VPS today. All thresholds are **operator rule-of-
thumb**, not vendor-published hard limits.

| Scale metric | Trigger | Next layer | Approx monthly cost |
|---|---|---|---|
| Day 1, < 100 RPS, single region | Always | Cloudflare Free + single Redis + direct Postgres | ~$0 infra beyond VPS |
| FastAPI workers > ~20 pooled | Conn pressure | PgBouncer or Supavisor | $0 (same VPS) |
| `max_connections > ~50` | First "too many clients" | Same | $0 |
| OLTP > 70% CPU + read-heavy reports | Read traffic dominates | Read replica (single hot standby) | 2nd VPS, ~$10–$20/mo |
| Single-region > 10⁵ req/min, want global edge | Latency sensitive | Cloudflare Pro | $20/mo |
| Single Postgres > ~1 TB or sustained > 10⁵ writes/s | Vertical headroom exhausted | Time-partition hot tables + bigger VPS, then Citus | $80–$200/mo VPS tier |
| Audit logs > 100 GB | Year 1 onwards | RANGE-partition `audit_logs` by day/week, pg_partman | $0 (same VPS) |
| BullMQ jobs growing past single Redis | Single-Redis contention | Dedicated Redis or BullMQ workers split | $0–$10/mo |
| Multi-region | Disaster recovery | CDN + read replica + S3 backups + Cloudflare Pro | $50–$100/mo |
| Truly planetary (Shopify / Slack scale) | 10⁶+ merchants | Sharding (Citus or future Multigres) — NOT in scope for 8 GB VPS | $1000+/mo |

Sources for cost values (per search snippets — see honest caveat at top):
- Sentry pricing: https://sentry.io/pricing/ ; https://aitoolpick.org/blog/sentry-pricing-2026/ (LOW confidence on prices)
- Datadog pricing: https://www.datadoghq.com/pricing/ ; https://www.aiclouddatapulse.com/datadog-cost/ (LOW confidence on exact $)
- Cloudflare pricing: https://costbench.com/software/cdn/cloudflare/ ; https://costbench.com/software/cdn-edge/cloudflare/ (LOW confidence)
- AWS SQS pricing: https://aws.amazon.com/sqs/pricing/ (HIGH — primary source for "1 M req/mo free, $0.40/M standard")
- Supabase managed pricing (aggregator): https://costbench.com/software/database-as-service/supabase/ ; https://comparedge.com/tools/supabase/pricing (LOW confidence — official page not extracted)

> ⚠️ Honest gap on numbers: every "$/mo" line above is a synthesis from a search
> snippet, not a verified primary read. **Do not cite as a budget figure without
> re-checking the live vendor pricing page.** The *trigger conditions* are higher
> confidence than the *prices*.

### 8.1 Implication for Hybrid (current size — what to deploy today, what to defer)

**Deploy today (Phase A — already prepared):**
1. Cloudflare Free + the two edge-cache rules in `infra/cloudflare/`.
2. PgBouncer or Supavisor in **session mode** (because `SET LOCAL` + transaction is
   used everywhere — transaction mode would require explicit discipline).
3. Sentry on free tier for crash reporting.
4. Structured JSON logs to a self-hosted Loki or to Sentry logs (when paid).

**Defer (Phase B triggers):**
- Datadog / Honeycomb (per-host pricing) — not necessary until ≥3 services to monitor.
- Read replica — until reporting/analytics pressure mounts.
- Sharding — until either multi-TB writes or regulatory per-tenant data residency.
- AWS SQS — until cross-region durability becomes a need.

---

## 9. Honest gaps in this research

The following items could not be verified in this session because the `web_extract`
backend was search-only and the search engine snippets did not surface the
information. Listed openly so the audit author knows what to re-verify manually.

| Gap | What was looked for | What to do |
|---|---|---|
| Shopify "RAG tier system" or "gateway tier" | Public doc on `shopify.dev` or `shopify.engineering` | Treat the existence as **unverified** — no primary source found. |
| BigCommerce internal DB tenancy model | Primary engineering blog | **Honest gap** — only "multi-storefront with shared catalog" product framing was retrieved. |
| Lightspeed internal DB tenancy model | Primary engineering blog | **Honest gap.** |
| BigCommerce exact concurrent-request numeric cap | `developer.bigcommerce.com` rate-limit page | Third-party "5 concurrent" not verified on primary docs. |
| Stripe's upstream DDoS provider (Cloudflare vs AWS) | Stripe engineering blog | **Not publicly disclosed.** |
| Amazon Pay idempotency-key spec | `developer.amazon.com` payment docs | **Primary source not retrieved.** Manual verification needed. |
| bKash / Nagad primary engineering docs | `developer.bka.sh`, `developer.nagad.com.bd` | **Not retrieved** this session; use community SDKs or contact the integration teams. |
| Shopify exact per-pod shop count | `shopify.engineering` | Not published — third-party heuristics only. |
| Vendor-published "shard at N" thresholds | Shopify, Slack, Discord, Notion engineering blogs | **No clean primary-source threshold exists.** Cited scale signals (Slack 2.3 M QPS, Discord 12→177 nodes) are not thresholds. |
| Honeycomb current per-event pricing | `honeycomb.io/pricing` | **Page not extracted** this session. |
| `web_extract` full-page reads | Every page cited | **Tool limitation: search-only backend.** Every quote is from a snippet. |
| Official Supabase pricing page | `supabase.com/pricing` | **Page not directly read** — cited via secondary aggregators. |

---

## 10. URL index (every link cited)

### Shopify official
- https://shopify.dev/docs/api/usage/limits
- https://shopify.dev/docs/api/admin-rest/usage/rate-limits
- https://shopify.dev/docs/api/admin-graphql
- https://shopify.dev/docs/api/admin-graphql/latest.txt
- https://shopify.engineering/horizontally-scaling-the-rails-backend-of-shop-app-with-vitess
- https://shopify.engineering/scaling-inventory-reservations
- https://shopify.engineering/scaling-inventory-mysql-skip-locked
- https://shopify.engineering/mysql-database-shard-balancing-terabyte-scale
- https://shopify.engineering/high-availability-background-jobs
- https://www.shopify.com/partners/blog/rate-limits
- https://community.shopify.com/t/x-shopify-shop-api-call-limit-for-throttled-requests-429-too-many-requests-has-value-1-40/66951
- https://community.shopify.dev/t/throttled-on-shopifyqlquery-graphql-endpoint-despite-headroom/29274
- https://sujeet.pro/articles/shopify-pod-architecture
- https://blog.bytebytego.com/p/how-shopify-manages-its-petabyte
- https://blog.waelouf.com/post/blog/shopify-bbg/ (low-confidence 489 M req/min)

### Stripe official
- https://docs.stripe.com/api/idempotent_requests
- https://docs.stripe.com/error-low-level
- https://docs.stripe.com/api/errors/handling
- https://docs.stripe.com/api-v2-overview
- https://docs.stripe.com/rate-limits
- https://stripe.com/blog/idempotency
- https://stripe.com/blog/rate-limiters
- https://docs.stripe.com/cli/post

### BigCommerce / Salesforce / VTEX / Lightspeed / Square
- https://docs.bigcommerce.com/developer/docs/overview/api-fundamentals/rate-limits
- https://docs.bigcommerce.com/developer/docs/overview/api-fundamentals/integration-design
- https://www.bigcommerce.com/blog/navigating-bigcommerces-api-rate-limits-update/
- https://architect.salesforce.com/docs/architect/fundamentals/guide/platform-multitenant-architecture.html
- https://admin.salesforce.com/blog/2025/the-apartment-analogy-making-sense-of-salesforces-multitenant-architecture
- https://dev.vtex.com/en-us/assets/interactive-architecture/
- https://aws.amazon.com/blogs/apn/vtex-built-a-cost-per-tenant-strategy-e-commerce-platform-on-aws/
- https://www.lightspeedsolutions.com/Multi-Tenant/
- https://developer.squareup.com/docs/build-basics/common-api-patterns/idempotency

### Slack
- https://slack.engineering/migrating-millions-of-concurrent-websockets-to-envoy/
- https://slack.engineering/scaling-datastores-at-slack-with-vitess/
- https://docs.slack.dev/apis/events-api/using-socket-mode/
- https://docs.slack.dev/tools/bolt-js/concepts/socket-mode/
- https://blog.bytebytego.com/p/how-slack-supports-billions-of-daily

### Supabase / Postgres / PgBouncer / Supavisor
- https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/database-advisors?lint=0003_auth_rls_initplan
- https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL
- https://supabase.com/docs/guides/database/connection-management
- https://supabase.com/docs/guides/self-hosting/docker
- https://supabase.com/docs/guides/troubleshooting/how-to-change-max-database-connections-_BQ8P5
- https://supabase.com/blog/realtime-row-level-security-in-postgresql
- https://supabase.com/blog/supavisor-postgres-connection-pooler
- https://supabase.com/blog/multigres-vitess-for-postgres
- https://supabase.com/features/supavisor
- https://supabase.com/pricing (page not directly read)
- https://github.com/supabase/supavisor
- https://github.com/orgs/supabase/discussions/40593
- https://github.com/orgs/supabase/discussions/14576
- https://coolify.io/docs/services/supabase
- https://www.pgbouncer.org/
- https://www.pgbouncer.org/features.html
- https://github.com/pgbouncer/pgbouncer/issues/246
- https://github.com/pgbouncer/pgbouncer/issues/655
- https://www.postgresql.org/docs/current/runtime-config-connection.html
- https://www.postgresql.org/docs/current/runtime-config-replication.html
- https://www.postgresql.org/docs/current/high-availability.html
- https://www.postgresql.org/docs/current/ddl-partitioning.html
- https://pgxn.org/dist/pg_partman/doc/pg_partman.html
- https://github.com/pgpartman/pg_partman
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL_Partitions.html

### AWS / Azure / Citus / Vitess
- https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/silo-pool-and-bridge-models.html
- https://docs.aws.amazon.com/solutions/multi-tenant-architectures-on-aws/
- https://docs.aws.amazon.com/whitepapers/latest/saas-architecture-fundamentals/full-stack-silo-and-pool.html
- https://aws.amazon.com/blogs/database/best-practices-for-sizing-your-amazon-elasticache-for-redis-clusters/
- https://aws.amazon.com/rds/postgresql/pricing/
- https://aws.amazon.com/sqs/pricing/
- https://learn.microsoft.com/en-us/azure/azure-sql/database/saas-tenancy-app-design-patterns?view=azuresql
- https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/overview
- https://learn.microsoft.com/en-us/azure/architecture/guide/saas-multitenant-solution-architecture/
- https://learn.microsoft.com/en-us/postgresql/citus/tutorial-multi-tenant?view=citus-14
- https://learn.microsoft.com/en-us/postgresql/citus/data-modeling?view=citus-14
- https://docs.citusdata.com/en/stable/use_cases/multi_tenant.html
- https://www.usenix.org/conference/lisa12/vitess-scaling-mysql-youtube-using-go
- https://github.com/cockroachdb/docs/issues/2862 (background only)

### Queue / idempotency / observability
- https://sidekiq.org/
- https://github.com/sidekiq/sidekiq
- https://bullmq.io/
- https://docs.bullmq.io/
- https://github.com/taskforcesh/bullmq
- https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-fifo-queues.html
- https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-exactly-once-processing.html
- https://docs.cloud.google.com/pubsub/docs/exactly-once-delivery
- https://docs.cloud.google.com/pubsub/docs/lease-management
- https://docs.sentry.io/
- https://docs.sentry.io/product/sentry-basics/performance-monitoring/
- https://docs.sentry.io/platforms/python/tracing/distributed-tracing/
- https://sentry.io/pricing/
- https://www.datadoghq.com/pricing/
- https://www.honeycomb.io/platform/distributed-tracing
- https://docs.honeycomb.io/notify/slos
- https://opentelemetry.io/
- https://opentelemetry.io/docs/concepts/observability-primer/

### Realtime / pub-sub / WS
- https://ably.com/blog/scaling-pub-sub-with-websockets-and-redis
- https://dev.to/ably/scaling-pubsub-with-websockets-and-redis-5b2c
- https://blog.mattheworiordan.com/p/scaling-websockets-to-billions-of
- https://ably.com/topic/pusher-vs-websockets
- https://websocket.org/guides/websockets-at-scale/
- https://websocket.org/comparisons/managed-services/

### Caching / CDN
- https://redis.antirez.com/fundamental/cache-stampede-prevention.html
- https://dev.to/serifcolakel/cache-stampede-in-go-preventing-thundering-herds-with-singleflight-stale-caching-and-request-2ho6
- https://oneuptime.com/blog/post/2026-01-21-redis-cache-stampede/view
- https://www.contentbuffer.com/guides/cache-stampede-beat-thundering-herd-redis
- https://vercel.com/docs/incremental-static-regeneration
- https://vercel.com/blog/isr-a-flexible-way-to-cache-dynamic-content
- https://developers.cloudflare.com/cache/
- https://developers.cloudflare.com/cache/how-to/purge-cache/
- https://developers.cloudflare.com/kv/examples/cache-data-with-workers-kv/
- https://www.fastly.com/documentation/reference/http/http-headers/Surrogate-Key/
- https://www.fastly.com/documentation/guides/full-site-delivery/purging/purging-with-surrogate-keys/
- https://codelit.io/blog/caching-patterns-write-through-aside-behind
- https://www.cacheinvalidation.org/advanced-cache-invalidation-patterns-synchronization/write-through-vs-write-behind-caching/
- https://redis.io/tutorials/operate/redis-at-scale/scalability/

### DDoS / Stripe rate-limiter design
- https://reintech.io/blog/utilizing-cloudflare-spectrum-for-non-http-service-protection
- https://flowtriq.com/blog/cloud-ddos-protection-comparison
- https://blog.cloudflare.com/ddos-threat-report-for-2024-q4/
- https://vinay199129.github.io/system-design-zth/case-studies/p2-rate-limiting-01-stripe-token-bucket/
- https://scaleengineer.com/blog/how-stripe-scales-its-apis-using-rate-limiters
- https://redis.io/tutorials/howtos/ratelimiting/
- https://ratelimit.arunavasircar.com/
- https://medium.com/swlh/rate-limiting-fdf15bfe84ab

### Bangladesh couriers / payments (community + SDK repos — primary provider docs not retrieved)
- https://packagist.org/packages/kejubayer/steadfast-api-integration
- https://github.com/kejubayer/steadfast-api-integration
- https://github.com/topics/steadfast-api

### Practitioner write-ups used as cross-checks
- https://hunchbite.com/guides/multi-tenant-saas-architecture
- https://notixit.com/blog/multi-tenant-saas-architecture-scaling
- https://monpg.app/blog/postgresql-multitenant-schema-design
- https://loke.dev/blog/multi-tenant-postgres-performance-killers
- https://www.crunchydata.com/blog/designing-your-postgres-database-for-multi-tenancy
- https://www.addwebsolution.com/blog/multi-tenant-performance-crisis-advanced-isolation-2026
- https://www.bytebase.com/blog/postgres-row-level-security-footguns/
- https://zenn.dev/cosoado/articles/supabase-rls-auth-uid-perf
- https://mofas.loke.dev/blog/multi-tenant-postgres-performance-killers (alias)
- https://opensource-db.com/how-we-solved-prepared-statement-issues-with-pgbouncers-pooling-modes/
- https://www.michal-drozd.com/en/blog/pgbouncer-listen-notify-transaction-pooling/
- https://mohashari.github.io/pgbouncer-transaction-session-pooling-prepared-statements-multiplexing/
- https://dzone.com/articles/database-connection-pooling-at-scale-pgbouncer-mul
- https://oneuptime.com/blog/post/2026-02-02-postgresql-pgbouncer-pooling/view
- https://dba.stackexchange.com/questions/342601/help-understand-why-rls-significantly-affects-query-performance
- https://stackoverflow.com/questions/30778015/how-to-increase-the-max-connections-in-postgres
- https://thecodeforge.io/database/read-replicas-postgresql/
- https://itemscv.com/en/blog/postgresql-read-replica-practical-guide
- https://kindatechnical.com/postgresql/read-replicas-and-load-balancing-strategies.html
- https://amirulislamalmamun.com/practice/data-engineering/071-read-replicas-and-replication-lag/
- https://discord.com/blog/how-discord-stores-trillions-of-messages
- https://www.scylladb.com/tech-talk/how-discord-migrated-trillions-of-messages-from-cassandra-to-scylladb/

End of document.
