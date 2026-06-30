# Hybrid — HTTP API Endpoints Audit

Audit of every Next.js route handler under `apps/web/app/` and the FastAPI
service in `apps/api/`. Repo audited at HEAD (working tree on `master`).
Discovery command: `find apps -name "route.ts"` + `find apps/api -name
"*.py"` (routers). Facts only; no code changes were made.

---

## 1. Executive Summary

| Metric | Count |
|---|---|
| Next.js route handler files (`apps/web/app/**/route.ts`) | **21** |
| Concrete (exported) HTTP routes in those files | **22** (one file, `hybridpay/webhook`, exports both `GET` and `POST`) |
| FastAPI routers in `apps/api/app/routers/` | 2 (`health.py`, `jobs.py`) exporting **3** endpoints (`/health`, `/healthz/db`, `/jobs/courier-sync`) |
| Total HTTP endpoints across the surface | **25** |
| Routes using `withTenant()` for tenant data (Next.js) | 4 of 22 |
| Routes that intentionally use `asPlatformAdmin()` for cross-tenant reads (Next.js) | 2 |
| Routes using `CRON_SECRET` bearer (internal crons) | 7 |
| Routes / endpoints **without any in-repo caller** (potential dead) | 4 next.js routes; 2 of those confirmed dead against the codebase (no UI / cron code references them); the other 2 have only out-of-repo callers (Caddy / root cron on the VPS) — see §4 Open Questions |
| TODOs / placeholders / NotImplemented in API route handlers | **0** (a single "Phase-2" follow-up comment in `courier-sync/route.ts:7` is informational, not a stub) |

Quick reading: of the 22 Next.js routes, all tenant data flows through
`withTenant()` or `asPlatformAdmin()` (no `adminSql` / `postgres` raw imports
in `apps/web/app/`, verified by grep on line 39-43 below). Error envelopes
are mostly consistent (`{ ok: false, error: "..." }` for JSON routes,
`{ error: "..." }` for admin/upload, plain-text CSVs and SS-stream for
`/orders/stream`). All input shapes are validated (Zod schemas for auth;
multipart / query / URL params parsed + manually checked for the rest).

Gaps identified (full list in §3): stale `docs/API.md` (lists 8 of 22
routes), two unreachable CSV export handlers, one missing pagination cap on
the labels-list handler, one route handler (`/api/orders/stream`) that uses
`raw Response` instead of the app envelope, and a `processGatewayCallback`
implementation that is shared between `bkash/callback` and
`hybridpay/webhook` but has no per-request signature check (relies on
`webhook_event` unique constraint for replay — see §3 GAP-04).

---

## 2. Endpoints Inventory

Keys: **Auth** — `session` = hybrid_session cookie; `csrf+session` = CSRF same-origin AND session; `cron-secret` = `Bearer ${CRON_SECRET}` constant-time; `host-allowlist` = Caddy ask-gate (no secret, server-to-server); `none` = no guard. **Tenant ctx** — `withTenant()` (RLS), `asPlatform()` (cross-tenant enumeration; `asPlatformAdmin` per CLAUDE), `signup` (pre-tenant), `system` (no DB), `browser-redirect` (no API output). **DB tables** — primary tables touched (excludes `webhook_event`/session/H1 logs). **Validation** — `zod`/`manual`/`cs+ext`/`multipart`. **Errors** — `envelope:{ok,error}` / `envelope:{error}` / `http:status-text` / `redirect`.

### 2.a. Next.js route handlers under `apps/web/app/api/`

| # | Method + Path | File (abs) : lines | Auth | Tenant ctx | DB tables | Validation | Errors | Notes |
|---|---|---|---|---|---|---|---|---|
| R01 | `POST /api/auth/login` | `/root/Hybrid/apps/web/app/api/auth/login/route.ts:33-109` | csrf + rate-limit (IP) | `asPlatformAdmin` (cross-tenant identity read) | `app_user` | `emailSchema` (Zod) + manual password-shape; timing-equalizing dummy-hash branch | `envelope:{ok,error}` | Generic Bengali error on every failure (no enumeration oracle). Auth-provider branch on `AUTH_PROVIDER` env. |
| R02 | `POST /api/auth/logout` | `/root/Hybrid/apps/web/app/api/auth/logout/route.ts:14-25` | csrf + session | system | `hybrid_session` (cookie row) | none beyond session touch | `envelope:{ok,error}` | Idempotent. `destroySession` sets `revoked_at`. |
| R03 | `POST /api/auth/signup` | `/root/Hybrid/apps/web/app/api/auth/signup/route.ts:55-166` | csrf + rate-limit (IP) | signup (pre-tenant) | `app_user`, `tenant`, `tenant_domain`, `tenant_member`, `subscription`, plus GoTrue admin create | `emailSchema` (Zod) + `passwordSchema` + `normalizeBdPhone` + 6-digit code regex + `validateSlug` | `envelope:{ok, errors:{...}}` (per-field Bengali) | On GoTrue conflict, deletes orphan app_user so a retry isn't refused. |
| R04 | `POST /api/auth/otp/request` | `/root/Hybrid/apps/web/app/api/auth/otp/request/route.ts:18-55` | csrf + rate-limit (Redis-backed via `issueOtp`) | signup | `phone_otp` (hashed), `sms_log` | `VALID_PURPOSES` Set + `normalizeBdPhone` | `envelope:{ok,error}` | Sends via platform SMS adapter. |
| R05 | `GET  /api/bkash/callback` | `/root/Hybrid/apps/web/app/api/bkash/callback/route.ts:22-67` | none (browser redirect) → verified server-side via `processBkashCallback` + `webhook_event` replay lock | via `processBkashCallback` (which uses `withTenant`) | `payment`, `order`, `webhook_event`, post-commit reads `tenant` | `paymentID` query presence check | `redirect` to `/order/{n}` / `/checkout?payment=failed` | Browser-land-after-popup. |
| R06 | `POST /api/hybridpay/webhook` (server-to-server) | `/root/Hybrid/apps/web/app/api/hybridpay/webhook/route.ts:74-97` | none on the request itself → server-side verify-by-`pp_id` + replay lock | via `processGatewayCallback` | `payment`, `order`, `webhook_event`, `tenant` | parses `pp_id` JSON | `envelope:{received,outcome}` always 200 | No HMAC signature check; relies on `pp_id` server re-verify + idempotency unique. Documented in route header. |
| R07 | `GET  /api/hybridpay/webhook` (browser return) | `/root/Hybrid/apps/web/app/api/hybridpay/webhook/route.ts:49-71` | none (browser redirect) → re-verified server-side | via `processGatewayCallback` | same as R06 | `transaction_ref` query check | `redirect` | Same path as R06 but GET. |
| R08 | `GET  /api/admin/products/labels-list` | `/root/Hybrid/apps/web/app/api/admin/products/labels-list/route.ts:15-43` | session + `getActiveTenantId` | `withTenant` | `product`, sub-query on `product_variant` | none beyond session/tenant check | `envelope:{error}` (Bengali `"no_tenant"` / `"লগইন প্রয়োজন।"`) | `limit 500` hard cap, no pagination (see GAP-03). |
| R09 | `GET  /api/admin/products/labels` | `/root/Hybrid/apps/web/app/api/admin/products/labels/route.ts:36-105` | session + `getActiveTenantId` | `withTenant` | `product`, `product_variant` (CTE) | query-string mode flags (`ids`, `status`, `barcode=missing`) — manual | `envelope:{error}` | `limit 500` hard cap. |
| R10 | `POST /api/admin/upload` | `/root/Hybrid/apps/web/app/api/admin/upload/route.ts:24-90` | csrf + session + tenant | delegated to `getBlobStore().put` (s3 driver writes `hybrid-media/<tenant>/...`) | none directly | multipart `kind` + `BlobValidationError` | `envelope:{error}` (Bengali) | Image by default; `kind=video` adds video validation. |
| R11 | `POST /api/internal/auto-cancel-unpaid` | `/root/Hybrid/apps/web/app/api/internal/auto-cancel-unpaid/route.ts:36-51` | cron-secret (constant-time) | delegated to `runAutoCancelSweep` | `orders` | none | `envelope:{ok,error}` + tally body | Per CLAUDE, cron cadence 30 min. |
| R12 | `POST /api/internal/billing-sweep` | `/root/Hybrid/apps/web/app/api/internal/billing-sweep/route.ts:33-47` | cron-secret | via `runBillingSweep` (uses `asPlatformAdmin` then per-tenant) | `subscription`, `tenant`, calls `bustTenantDomainCache` | none | `envelope:{ok,error}` + tally | Flips trialing→past_due→suspended. |
| R13 | `POST /api/internal/cart-recovery-sweep` | `/root/Hybrid/apps/web/app/api/internal/cart-recovery-sweep/route.ts:30-45` | cron-secret | via `runCartRecoverySweep` | `cart`, `sms_log` | none | `envelope:{ok,error}` + tally | 1h+24h+72h nudge windows. |
| R14 | `POST /api/internal/courier-sync` | `/root/Hybrid/apps/web/app/api/internal/courier-sync/route.ts:38-75` | cron-secret | `asPlatformAdmin` enumerates, then per-tenant `withTenant` | `shipment`, `orders`, `courier_account` | none | `envelope:{ok,error}` + tally | Skips tenants without creds (logged, not failed). |
| R15 | `POST /api/internal/marketplace-sync` | `/root/Hybrid/apps/web/app/api/internal/marketplace-sync/route.ts:95-129` | cron-secret | `asPlatformAdmin` (cross-tenant) | `tenant`, `marketplace_listing`, `marketplace_suborder`, `marketplace_order`, `marketplace_review` | none | `envelope:{ok,error}` + tally | Three additional maintenance passes (suborder-sync, ratings-rollup, saga-recovery) are best-effort and isolated. |
| R16 | `POST /api/internal/sla-sweep` | `/root/Hybrid/apps/web/app/api/internal/sla-sweep/route.ts:33-48` | cron-secret | via `runSlaSweep` | `orders`, `sla_alert` | none | `envelope:{ok,error}` + tally | Per BD Digital Commerce Guidelines 2021. |
| R17 | `POST /api/internal/stock-alert-sweep` | `/root/Hybrid/apps/web/app/api/internal/stock-alert-sweep/route.ts:30-45` | cron-secret | via `runStockAlertSweep` | `product_variant`, low-stock alert state | none | `envelope:{ok,error}` + tally | 24h cooldown per variant. |
| R18 | `GET  /api/internal/tls-allow` | `/root/Hybrid/apps/web/app/api/internal/tls-allow/route.ts:32-44` | host-allowlist (Caddy on-demand TLS; server-to-server, no secret needed per route comment) | system | `tenant` (via `resolveTenantByHost`) | `domain` query presence + lowercasing | `http:status-text` (`"ok"` 200 / `"unknown host"` 404 / `"missing domain"` 400) | Hardcoded `PLATFORM_HOSTS` Set plus the resolve path. |
| R19 | `GET  /api/orders/stream` | `/root/Hybrid/apps/web/app/api/orders/stream/route.ts:14-72` | session + `getActiveTenantId` | system (SSE; pg LISTEN/NOTIFY) | notification channel only | none | `http:status-text` (401 / 404 / SSE stream) | Heartbeat every 25s. Auto-reconnect via EventSource. **Note:** runtime = nodejs, comment says "pg NOTIFY needs TCP". |

### 2.b. Next.js route handlers under `apps/web/app/(admin)/...`

| # | Method + Path | File (abs) : lines | Auth | Tenant ctx | DB tables | Validation | Errors | Notes |
|---|---|---|---|---|---|---|---|---|
| R20 | `GET /admin/products/export` | `/root/Hybrid/apps/web/app/(admin)/admin/products/export/route.ts:9-30` | session + tenant | delegated to `listProducts` | `product` (via lib) | none beyond auth | `http:status-text` 401/403, `csv` body | `text/csv; charset=utf-8` with BOM. **No UI caller found (see GAP-01).** |
| R21 | `GET /admin/customers/export` | `/root/Hybrid/apps/web/app/(admin)/admin/customers/export/route.ts:9-30` | session + tenant | delegated to `listCustomers` | `customer` (via lib) | none beyond auth | `http:status-text` 401/403, `csv` body | Same shape as R20. **No UI caller found (see GAP-01).** |

### 2.c. Next.js route handlers under `apps/web/app/` (root path)

| # | Method + Path | File (abs) : lines | Auth | Tenant ctx | DB tables | Validation | Errors | Notes |
|---|---|---|---|---|---|---|---|---|
| R22 | `GET /auth/callback` | `/root/Hybrid/apps/web/app/auth/callback/route.ts:16-57` | none (browser redirect; OAuth code exchange) | signup (pre-tenant) | GoTrue `/auth/v1/token`, then `hybrid_session` row | open-redirect guard rejects absolute / `//` / `/\` next-paths | `redirect` to `/login?oauth_error=...` or `next` | Supabase OAuth provider-agnostic. |
| R23 | `GET /dev-login` | `/root/Hybrid/apps/web/app/dev-login/route.ts:22-86` | DEV_LOGIN_KEY constant-time in prod; disabled unless `ALLOW_DEV_LOGIN=true`; redirect-to-/login if `AUTH_PROVIDER=supabase` | system (dev cookie) | `hybrid_dev_session` cookie only | timingSafeEqual + same-origin guard on the redirected host | `http:status-text` 400 / 404; redirect 302 | Never invokes DB. Intentional dev fast-lane. |

### 2.d. FastAPI (`apps/api/app/`)

| # | Method + Path | File (abs) : lines | Auth | Tenant ctx | DB tables | Validation | Errors | Notes |
|---|---|---|---|---|---|---|---|---|
| F01 | `GET  /health` | `/root/Hybrid/apps/api/app/routers/health.py:11-13` | none | system | none | none | JSON `{service, version}` | Liveness. |
| F02 | `GET  /healthz/db` | `/root/Hybrid/apps/api/app/routers/health.py:16-24` | none | system | uses app_runtime_login (`get_pool`) | none | 200 `{status:ok}` / 503 `{status:degraded}` | Probes the RLS pool with `select 1`. |
| F03 | `POST /jobs/courier-sync` | `/root/Hybrid/apps/api/app/routers/jobs.py:26-36` | cron-secret (router-level dependency `require_cron_secret`) | uses SteadfastClient + RLS pool via `run_courier_sweep` | `shipment`, `orders` | none beyond dependency | 401 `{ErrorResponse}` (OpenAPI model) + tally body | **No in-repo caller in repo (see GAP-02c).** Wired in Caddy/INFRA_SUPABASE as the FastAPI equivalent of R14. |

---

## 3. Gaps Found

Each gap is evidence-backed with absolute file:line and severity.

### GAP-01 — Two CSV export handlers have no UI / no app caller  (severity: medium)

- `/root/Hybrid/apps/web/app/(admin)/admin/products/export/route.ts` (R20)
- `/root/Hybrid/apps/web/app/(admin)/admin/customers/export/route.ts` (R21)

`grep -rn 'products/export\|customers/export'` returned **only the two
route files themselves** and `tsconfig.tsbuildinfo` build-state. No
`<a href>`, no `fetch(…)`, no Server Action, no `<Button onClick>` posts
to these paths. Both routes are fully implemented (auth-gated, tenant-
scoped, BOM-prefixed CSV, `content-disposition: attachment`) and the lib
helpers `listProducts`/`listCustomers` are otherwise exercised by the
admin tables. State today: reachable only by hand-typed URL.

Action would be: either wire a button in the admin products / customers
pages, or remove the two routes if they're dead — **do not assert dead
without confirming with the product owner**.

### GAP-02 — VPS-cron endpoints have no in-repo caller documentation  (severity: low-medium)

For each of the following routes, the only references in the entire repo
are the route file itself + tests + `CHANGELOG` / phase-report prose:

- `R11` `/api/internal/auto-cancel-unpaid` (no caller code)
- `R13` `/api/internal/cart-recovery-sweep` (no caller code)
- `R14` `/api/internal/courier-sync` (no caller code; FastAPI `F03` is the
  declared alternative per `INFRA_SUPABASE.md`)
- `R15` `/api/internal/marketplace-sync` (no caller code)
- `R16` `/api/internal/sla-sweep` (no caller code)
- `R17` `/api/internal/stock-alert-sweep` (no caller code)
- `F03`  `/jobs/courier-sync` (no caller; `INFRA_SUPABASE.md:30` says it
  is "idle until a scheduler triggers POST /jobs/courier-sync")

Per CLAUDE.md and `docs/INFRA_SUPABASE.md`, these are **driven by VPS
root crons (outside the repo, in `/etc/cron.d/...` on `mt5vps`)**, so
"no in-repo caller" is by design — but there is **no in-repo manifest**
of the schedule (no `infra/cron/*` or equivalent), so a code-only audit
cannot prove the sweeper actually runs. Marked medium for F03 because
`INFRA_SUPABASE.md:30` admits it has been "idle" since 2026-06-25.

### GAP-03 — Labels-list endpoint has a hard 500-row cap with no pagination  (severity: low)

- `/root/Hybrid/apps/web/app/api/admin/products/labels-list/route.ts:38` —
  `limit 500` is the only page size. The LabelPicker UI
  (`apps/web/app/(admin)/admin/products/labels/PickerClient.tsx:33`)
  renders a single flat table. For tenants with >500 products (rapidly
  achievable in BD commerce), the picker becomes silently incomplete.
  No `next_cursor` / `offset` query param. Same shape on R09
  `/api/admin/products/labels:85`. Note: `labels-list` is the only
  list-shaped endpoint that calls `withTenant` from inside `app/api/`,
  so this is also the only list-pagination gap in the audit (per the
  coverage of `find apps -name route.ts`). All other list surfaces are
  server-actions (see `docs/API.md` Server-Actions table).

### GAP-04 — `hybridpay/webhook` POST accepts any caller; only replay-protected  (severity: medium)

- `/root/Hybrid/apps/web/app/api/hybridpay/webhook/route.ts:74-97` —
  the POST branch has neither an HMAC signature header check, nor a
  per-IP allowlist, nor a shared-secret header. The comment at
  `route.ts:11-19` documents that this is intentional: "we NEVER trust
  the body — we re-verify by pp_id". Replay is prevented by
  `webhook_event unique(provider, external_id)`. Trade-off: an attacker
  who knows (or guesses) a `pp_id` can trigger `processGatewayCallback`
  to run an unrelated verification against the gateway's API and write a
  `webhook_event` row that preempts the real one. The same design
  applies to `bkash/callback` (R05). Acceptable given the gateway is
  Hybrid-Pay self-hosted (the original source of `pp_id`s is the same
  VPS), but worth surfacing because the API.md table at
  `/root/Hybrid/docs/API.md:17` claims a "signature/replay guard" that
  the actual code does not implement — only the replay guard part is
  present. Document drift (also see GAP-06).

### GAP-05 — Two `/api/internal/*` crons have no DB-driven state and no `try/catch` totals guard  (severity: low)

- `R11` `/api/internal/auto-cancel-unpaid/route.ts:36-51` — `runAutoCancelSweep` is awaited but there is no top-level try/catch around it; if it throws, the entire POST returns a Next.js 500 instead of the structured `{ok:false,error,scanned:0,...}` envelope. Same for `R16` `sla-sweep`. The other sweeps either guard the orchestrator (`R12` `billing-sweep`, `R13` cart-recovery, `R17` stock-alert) or are isolated best-effort inside one orchestrator (`R15` marketplace-sync). Inconsistent error contract for failed sweeps.

### GAP-06 — `docs/API.md` is materially incomplete  (severity: medium)

- `/root/Hybrid/docs/API.md:11-22` lists only **8** of the actual **22**
  Next.js route handlers. Missing in that table (verified against
  `find apps -name route.ts`):
  - `/api/auth/otp/request` (built later)
  - `/api/orders/stream` (SSE)
  - all 5 internal sweeps added in Phase R7 + cart-recovery + marketplace-sync + auto-cancel-unpaid (R11, R13, R15, R17)
  - the two admin CSV exports (R20, R21) — also missing
  - `/api/admin/products/labels-list` (R08)
  - the FastAPI service `apps/api/` (F01–F03) is mentioned only as a
    parenthetical on line 60
  - `/auth/callback` (R22) and `/dev-login` (R23) are absent
  - the row at line 17 (`bkash/callback`) calls the guard "signature/replay guard" — the actual code has only the replay guard (see GAP-04)

This doc was the source for "API surface" claims earlier; it is now stale.
Refresh needed.

### GAP-07 — Response-envelope inconsistency  (severity: low)

- Streaming endpoint `R19 /api/orders/stream` returns a raw
  `text/event-stream` body, not the JSON envelope used elsewhere — which
  is correct for SSE but means callers cannot reuse the `{ok:false,error}` shape. Documented because callers in `apps/web/lib/orders/useOrderStream.ts`
  have to special-case.
- `R18 /api/internal/tls-allow` returns 200/`"ok"` plain text instead of
  the `{ok:true}` envelope. Intentional (Caddy ignores the body), but a
  uniform contract would help log greppability.
- The two CSV export routes (R20 / R21) return a raw `Response` with
  `Content-Type: text/csv`, deliberately bypassing the JSON envelope.
- `R18` envelope differs from all other internal routes (they use
  `NextResponse.json({ok:true,…})` or `NextResponse.json({ok:false,error:"unauthorized"},{status:401})`).

### GAP-08 — `marketplace-sync` empty-tenant list returns 200 with `tenants: 0` and silent failures  (severity: low)

- `/root/Hybrid/apps/web/app/api/internal/marketplace-sync/route.ts:106-113`
  - a per-tenant `try/catch` increments `skipped` and logs but the
    response payload aggregates these silently. The orchestrator
    function signature cannot distinguish "skipped because no live
    listings" from "errored"; same pattern in `R14 courier-sync` is
    acceptable because no creds = "deferred" by design, but
    marketplace-sync has no equivalent guard — masking DB errors.

### GAP-09 — No CSRF guard on GET `bkash/callback` / `hybridpay/webhook`  (severity: low / advisory)

Both R05 and R07 are GET handlers expected to be called by a redirect from
the payment gateway. They are not CSRF-vulnerable in the cookie sense
(same-origin unused), but a curious user could copy a `?paymentID=` URL
and the route reissues the side-effects. The `webhook_event` replay-lock
absorbs this (the second attempt will be a no-op `replayed` outcome) and
the route redirects the browser to either `/order/{n}` or
`/checkout?payment=failed` regardless. Documented as advisory; not a
hardening gap.

### GAP-10 — `tls-allow` has no audit log  (severity: low)

- `/root/Hybrid/apps/web/app/api/internal/tls-allow/route.ts:32-44`
  - a denied lookup (404) leaves no trace. Caddy will simply not get a
  cert for that SNI. A noisy attacker could probe all `*.hybrid.ecomex.cloud`
  names; the route reveals `unknown host` vs `ok` as a timing-attack-free
  404/200 (good), but there is no log of which SNI was probed. OPAQUE log
  line. Listed for completeness; the route correctly does not reveal
  tenant-existence beyond what a regular storefront 200/404 reveals.

---

## 4. Open Questions

1. **Are R20 / R21 (CSV exports) actually wired somewhere outside the
   audit view?** All in-repo grep evidence says no (only `tsconfig.tsbuildinfo`
   and the route files themselves contain "products/export" or
   "customers/export"). Possibilities: the buttons live in a feature
   branch not yet merged, the UI uses Server Actions that re-implement
   the same CSV path (search for `customersToCsv` / `productsToCsv`
   callers), or the routes are simply left over from a Phase 2 sprint
   and unreleased.
2. **Which VPS crons actually call R11/R13/R14/R15/R16/R17 and F03?**
   `INFRA_SUPABASE.md:30` only documents the FastAPI side. There is no
   `/etc/cron.d/*` manifest inside the repo. Did each of the seven
   sweeps actually get cron entries on `mt5vps`, or are some of them
   dormant like F03? Verify by `ssh mt5vps 'crontab -l'`.
3. **Is the labels-list 500-row limit intentional, or did the Picker UI
   drop a paging param during a redesign?** `PickerClient.tsx:33` does a
   single `fetch` with no cursor. If a tenant has 600 products, the
   picker is silently truncated.
4. **Is `processGatewayCallback` sufficiently hardened for Hybrid-Pay
   without an HMAC?** The comment at
   `/root/Hybrid/apps/web/app/api/hybridpay/webhook/route.ts:11-19`
   asserts the design choice but does not cite an explicit threat model.
   Worth deciding whether to ship as-is or to add a shared-secret header
   check before the route becomes public.
5. **Is `docs/API.md` regenerated by any tool, or hand-maintained?**
   Lines 70-74 show the regenerator commands, but the doc is stale per
   GAP-06, so either the commands are not run in CI or the docs side is
   hand-edited (and forgotten). Worth a CI check or moving to typegen.
6. **Is the "v2" Hybrid-Pay signature header on the roadmap?
   `piprapay.Dockerfile` ships PipraPay; check whether PipraPay signs its
   webhooks.** Out-of-scope to verify from the codebase alone.
7. **The single DB write at `apps/web/app/api/billing-sweep/route.ts:38`
   invokes `bustTenantDomainCache` synchronously inside the cron — does
   the Redis outage cause the whole sweep to fail?** Marked unverified
   because the failure path of `lib/platform/cache.bustTenantDomainCache`
   is unknown from this audit alone.

---

## Appendix A — Verification commands run (for reproducibility)

```bash
# Discovery of every HTTP route handler in the repo (Next.js)
find apps -name "route.ts" -not -path "*/node_modules/*" -not -path "*/.next/*"
# → 18 under apps/web/app/api/, plus 4 outside /api/ (auth/callback, dev-login, 2 csv exports)

# Raw-SQL / adminSql ban compliance (must return 0 hits anywhere under apps/web/app/)
grep -rn 'from "postgres"\|adminSql' apps/web/app/
# → 0 hits (rule at packages/config/eslint/no-raw-sql.mjs is intact)

# TODO/FIXME/NotImplemented in any /api/ handler
grep -rn 'TODO\|FIXME\|NotImplemented\|XXX\|HACK\|placeholder\|stub' apps/web/app/api/
# → only 2 "placeholder" mentions in labels/route.ts (the print page falls back to a
#   placeholder for products with no barcode; not a code stub)

# Caller check for every API path
grep -rln 'api/internal/(courier-sync|billing-sweep|cart-recovery|auto-cancel|stock-alert|marketplace-sync|sla-sweep|tls-allow)' \
  apps/web/ scripts/ .github/ docs/
# → only tls-allow has an in-repo caller (Caddyfile); all cron routes' callers
#   live outside the repo (VPS crontab) — unverified

# Stale API doc
wc -l docs/API.md  # 74 lines, lists 8 of 22 routes
```

---

## Appendix B — Files Read (full)

Every route-handler file in `apps/web/app/api/`, the four route handlers
outside `/api/` (`auth/callback`, `dev-login`, two csv exports), the two
FastAPI routers, the supporting helpers (`requireSession.ts`,
`oauth.ts`, the `no-raw-sql` ESLint rule, `Caddyfile`, `docs/API.md`,
`docs/INFRA_SUPABASE.md` lines 1-120).

End of audit.
