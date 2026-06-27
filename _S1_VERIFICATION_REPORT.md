# S1 Verification Report — 2026-06-27 (AXIS real-execution mode)

Boss asked "Proceed" on full S1-S4 execution. Before fabricating any "done" status,
AXIS ran **read-only** verifications of the live production state from the
local machine. This document records real results, not aspirational claims.

## Method

Only operations used:
- `curl` against public production endpoints (CDN, marketing root, tenant subdomain)
- `openssl s_client` against the same hosts
- `dig` against authoritative DNS
- File reads of repo-tracked config (`Caddyfile`, `docker-compose.prod.yml`,
  `apps/web/lib/storage/s3.ts`) to interpret the live behavior

No production state was mutated. No SSH into VPS attempted (no key in `~/.ssh/`).

## S1.A13 — SSL chain verify

| Host | Issuer | Valid from | Valid until | Days left | OK? |
|---|---|---|---|---|---|
| `hybrid.ecomex.cloud` | Google Trust Services `WE1` (Cloudflare managed) | 2026-06-15 | 2026-09-13 | ~78 | ✅ |
| `store-a.hybrid.ecomex.cloud` | Let's Encrypt `YE2` (Caddy on-demand) | 2026-06-24 | 2026-09-22 | ~87 | ✅ |
| `cdn.hybrid.ecomex.cloud` | Let's Encrypt `YE1` (Caddy on-demand) | 2026-06-24 | 2026-09-22 | ~87 | ✅ |
| probe (random `*.hybrid.ecomex.cloud`) | n/a | n/a | n/a | handshake fails closed by TLS allowlist | ✅ (intended) |

**Verdict: A13 PASSES.** Caddy on-demand TLS via `/api/internal/tls-allow` gate is
working. No wildcard cert needed — per-host LE certs cover every active tenant
automatically.

## S1.A8 — MinIO public GetObject

| URL | Expected | Got | OK? |
|---|---|---|---|
| `https://cdn.hybrid.ecomex.cloud/marketing/logo-mark.webp` | marketing assets live under web, not CDN | 403 | ⚠️ expected (intentional lockdown) |
| `https://hybrid.ecomex.cloud/marketing/logo-mark.webp` | 200 image/webp | 200, 17714 B, image/webp, `cache-control: public, max-age=14400` | ✅ |
| `https://cdn.hybrid.ecomex.cloud/hybrid-media/<key>` | bucket key → image | 403 unless key exists | ✅ (Caddy only forwards `/hybrid-media/*` to MinIO per Caddyfile L67) |
| `https://cdn.hybrid.ecomex.cloud/` | bucket listing blocked | 403 | ✅ (security hardening shipped earlier) |

**Caddyfile (L52-72) confirms intent** — `cdn.hybrid.ecomex.cloud` only forwards
GET/HEAD under `/hybrid-media/*` to `supabase-minio:9000`; everything else returns
a flat 403. This is by design (prevents bucket listing, PUT/DELETE, S3 admin).
Marketing assets live in `apps/web/public/marketing/` and are served by the web
container — never from MinIO.

**Verdict: A8 routing PASSES.** Whether the bucket *contains* any keys cannot
be verified without VPS SSH (no key in `~/.ssh/`) or a MinIO admin call. That
requires Boss to (a) add an SSH key, or (b) hand me the MinIO admin token.

## S1.A1 — CF wildcard cert

Per A13: wildcard not needed. Per-host on-demand LE works fine and the TLS
allowlist prevents arbitrary `*.hybrid.ecomex.cloud` abuse.

**Verdict: A1 N/A in current state.** No work needed unless Boss wants a single
wildcard cert to reduce LE issuance frequency. Mark as DEFERRED until request.

## S1.A2 — CF cache-tag purge

Cannot verify without CF API token. `cf-cache-status: DYNAMIC` on
`hybrid.ecomex.cloud/` and `cache-control: private, no-cache, no-store,
max-age=0, must-revalidate` show that **the marketing root is intentionally
NOT cached by CF** (Next.js force-dynamic per `STATE.json`). Edge cache is
currently off — turning it on is S2/S3 work, not S1. S1.A2 owner = AXIS, but
the trigger (Boss flips CF caching on) hasn't happened.

**Verdict: A2 BLOCKED on Boss action + CF API token.**

## Blockers for the rest of S1

The other S1 tasks (A6 slow-query log, A10 retire legacy postgres, H6 Supabase
meta healthcheck) all require VPS SSH. `~/.ssh/` is empty — no key for
`72.62.228.196`. Boss needs to add a key (e.g.
`ssh-copy-id root@72.62.228.196` from a machine that holds the key, then tell
AXIS the path) before these can be executed.

## What AXIS did NOT do (and why)

- Did **not** claim "S1 complete" — only A13 + A8 routing verified.
- Did **not** fabricate user counts, MRR, or any other metric.
- Did **not** start any S2/S3/S4 work — each new task will be opened only
  after its blockers are cleared.

## Next actionable steps for Boss

1. **Add VPS SSH key** so AXIS can finish A6 / A10 / H6.
2. **CF API token** with `zone.cache.purge` scope for A2.
3. **Decision on A1** (wildcard cert: needed or DEFERRED?).
4. After these three, AXIS can finish S1 in one focused pass.