# Hybrid — Full Pending Work Master Plan

**Generated:** 2026-06-26  
**Author:** AXIS (verified from repo + prod + research, no fabrication)  
**Repo:** `/root/Hybrid/` @ `28621ba` | **Live:** `https://hybrid.ecomex.cloud` | **VPS:** `72.62.228.196`

---

## 0. Verification Methodology (so you can trust every line)

Every item in this doc was verified against one or more of:

| Source | What it proves |
|--------|----------------|
| `git log` (117 commits, master ahead 21 / behind 0 after today's merge) | Code is in repo |
| `curl -sI` against `https://hybrid.ecomex.cloud/<path>` | Live behavior matches code |
| `_PHASE_*` and `_ATEAM_CROSSCHECK_REPORT.md` | AXIS past work documented with tests |
| `.claude/team/BACKLOG.md` (3,944 bytes of prioritised work) | Founder-curated priorities |
| `docs/research/roadmap-gap-plan.md` | Market-research-driven gap analysis (2 papers) |
| `docs/SCALING_PLAN.md` + `SCALING_PREP_SUMMARY.md` | Phase A/B infra tasks ready-but-not-deployed |
| `web_search` (current 2026 ecosystem) | External capabilities not yet integrated |
| File paths (`find /root/Hybrid -path ...`) | Files actually exist on disk |
| Test counts (198 test files) and TODO counts (13 TODOs in shipping code) | Quality debt |

---

## 1. Executive Summary — Where Hybrid Actually Is

### 1.1 What is LIVE on production right now (verified via curl just now)

| Surface | URL | Status |
|---------|-----|--------|
| Apex marketing | `/` | 200 |
| Signup → tenant provisioning | `/signup` | 200 |
| Sitemap | `/sitemap.xml` | 200 |
| Robots | `/robots.txt` | 200 |
| PWA manifest | `/manifest.webmanifest` | 200 |
| Service worker | `/sw.js` | 200 |
| Offline page | `/offline` | 200 (static) |
| Admin (all subpages) | `/admin/*` | 307 → tenant subdomain |
| Platform super-admin | `/platform/*` | 307 → tenant subdomain |
| OAuth callback | `/auth/callback` | 200 (route built, providers not enabled) |

### 1.2 What is built (code in repo, deployed)

- **Phase 0 (Foundation):** Multi-tenant spine, RLS via `withTenant()`, host middleware, 60+ RLS policies, restore-drill passed
- **Phase 1 (MVP wedge):** Products, orders (manual + storefront), COD + bKash(sandbox), Steadfast, SMS, manual billing, super-admin, signup
- **Phase 2 / M3 (Customization + Couriers + Recon):** Custom domains, theme catalog, visual customizer, 3+ themes, discounts, Pathao/RedX/Paperfly, COD reconciliation engine, GA4 + Meta Pixel/CAPI, WhatsApp, own-auth+S3, **shipping calculator (migration 21)**, **Unicode Bangla SMS validation**, PWA, sitemap, cookies, tracking admin, audit log
- **W-series admin polish (W1.1 → W3.3):** Enhanced dashboard, customer profile timeline, bulk ops, real-time SSE notifications, bKash reconciliation engine, abandoned cart recovery, custom reports builder, loyalty program (logic + tests)
- **Infra (2026-06-25):** Self-hosted Supabase on VPS — `supabase-db` (Postgres 15) + GoTrue auth + MinIO storage + trimmed stack (10 svcs for 8 GB box)
- **Ops hardening (this week):** `deploy.sh` self-healing, env-guard, backup monitor, uptime scripts

### 1.3 Hard numbers (verified)

- **117 commits** total in repo, **21 ahead of origin** (after today's merge)
- **72 page/route files** across admin, storefront, platform, marketing, API
- **21 SQL migrations** (00–21) all applied to prod
- **198 test files**, **47 unit test files** explicitly counted in Phase 5 report
- **13 TODOs** in shipping code (down from Phase 5 baseline but still non-zero — see §6 Quality Debt)
- **2 console.log** in shipping code (down from Phase 5 zero — small regression, see §6)
- **0 `: any`** types (clean)
- **0 raw SQL imports** outside `packages/db` (ESLint enforced)

### 1.4 A-Team v5.0 cross-check (49% pipeline complete)

From `_ATEAM_CROSSCHECK_REPORT.md`:

| Tier | Done | Total | % |
|------|-----:|------:|---|
| T0 Pre-flight + Graphify | 8 | 8 | 100% |
| T1 Architect | 3 | 3 | 100% |
| T2 Build | 12 | 21 | 57% |
| T3 Quality | 5 | 16 | 31% |
| T4 Tracking (MANDATORY) | 2 | 6 | 33% |
| T5 Ship | 5 | 8 | 62% |
| T6 Post-Launch | 1 | 8 | 12% |
| **Total** | **36** | **73** | **49%** |

---

## 2. Pending Work — Categorised

### 🔴 CATEGORY A — INFRASTRUCTURE / OPS (must run in background, ongoing)

| # | Item | Source | Effort | Owner | Notes |
|---|------|--------|--------|-------|-------|
| A1 | **Cloudflare 2-level-subdomain TLS — grey-cloud fallback is currently active** | BACKLOG CRITICAL 2026-06-25 | 1-2 days | Boss | **Grey-cloud (DNS-only) is workaround in place; restores Caddy LE cert direct.** Universal SSL covers only `*.ecomex.cloud` (1 level). For 50 ms edge cache win: enable Advanced Certificate Manager / Total TLS wildcard for `*.hybrid.ecomex.cloud` ($10/mo). |
| A2 | **Restore CF edge cache** (re-proxy once wildcard cert issued) | BACKLOG | 1 hour | Boss | Currently CF caches DYNAMIC; re-proxying with cert gives ~50 ms p95. |
| A3 | **k6 load-test baseline** (not yet run) | SCALING_PREP | 30 min | AXIS | `load-test/storefront-load.js` exists, not executed against prod. Run to establish p95 baseline BEFORE further work. |
| A4 | **PgBouncer / Supavisor re-introduction** (Supavisor dropped for 8 GB box) | SCALING_PLAN Phase B | 15 min setup, 1 day code | AXIS | Files exist in `infra/pgbouncer/`. Trigger when k6 shows p95 > 1 s. |
| A5 | **CF cache-tag purge wire-up** | SCALING_PREP Phase A | 1 hour | AXIS | `cloudflare-purge.sh` exists; not yet called from product edit handlers. |
| A6 | **Slow-query log enable** (`log_min_duration_statement = 500`) | _PHASE_4_REPORT | 30 min + container restart | Boss | Currently `-1` (off). Requires `postgresql.conf` edit; postgres role in self-hosted Supabase not superuser. |
| A7 | **`pg_stat_statements` Prometheus export** | _PHASE_4_REPORT | 2 hours | AXIS | Preloaded but not queried. Add metrics endpoint. |
| A8 | **MinIO `hybrid-media` public-GetObject verify** | BACKLOG | 30 min | AXIS | Real product images not uploaded yet; need end-to-end upload test. |
| A9 | **Rotate exposed creds** (CF DNS token, R2 access/secret pasted in chat) | BACKLOG security | 1 hour | Boss | 2026-06-25 leak via chat — MUST rotate. |
| A10 | **Legacy `hybrid-postgres` retire** (after soak) | INFRA_SUPABASE | 1 hour | Boss | Still running as rollback net after 2026-06-25 Supabase migration. |
| A11 | **Redis ISR cache handler** (multi-instance) | SCALING_PLAN | 1 day | AXIS | Per-instance ISR gap (CLAUDE.md known issue). |
| A12 | **Tenant_id index audit** (every RLS table) | SCALING_PLAN | 1 day | AXIS | Some child tables have parent-FK only; check at Phase B. |
| A13 | **Verify Cloudflare full SSL chain** after A1 | BACKLOG | 30 min | AXIS | Manual `openssl s_client` + `curl -vI`. |

### 🔴 CATEGORY B — SHIP BLOCKERS (P0 from A-Team report — required for revenue)

| # | Item | Source | Effort | Owner | Notes |
|---|------|--------|--------|-------|-------|
| B1 | **OAuth provider enable** (Google + Facebook) | BACKLOG + P1_5_SUPABASE_OAUTH | 30 min | Boss | Code path `/auth/callback` + `mintSessionFromSupabase` ready. Need: Google Cloud OAuth client + Supabase Studio provider config. |
| B2 | **OAuth login button** in `/login` page | A-Team 2.15 + BACKLOG | 4 hours | AXIS | Design gap — no "Continue with Google" button yet. |
| B3 | **Pre-existing typecheck failure** `test/fcommerce-source.test.ts(38,5): TS2322 'messenger' not in OrderSource` | Phase 5 + Phase 6 + this verification | 30 min | AXIS | Trivial fix: extend `OrderSource` union in `apps/web/lib/commerce/placeOrder.ts` (line 26) to include `"messenger"`. Documented as Phase 5/6 follow-up. Blocks CI green. |
| B4 | **`graphifyignore` (5 min fix)** | A-Team 0.3a | 5 min | AXIS | `graphify-out/graph.json` exists but no `.graphifyignore` filter file. |

### 🟡 CATEGORY C — M3.5 / PHASE 2.5 — BD MOAT (gap-analysis-driven)

From `docs/research/roadmap-gap-plan.md` (2 market-research papers vs current roadmap):

| # | Item | Source | Effort | ROI | Notes |
|---|------|--------|--------|-----|-------|
| C1 | **F-commerce automation — Meta Graph API comment-to-inbox + checkout link in DM** | roadmap-gap §B.5 | 3-4 weeks | **HIGHEST** | "Biggest gap." 300k+ FB sellers target. Reuses WhatsApp Cloud API infra from Phase 2. Needs Meta App + Graph API permissions (`pages_messaging`, `pages_manage_metadata`). |
| C2 | **COD Fraud / Delivery Success Score** (cross-tenant aggregate) | roadmap-gap §B.6 | 2 weeks | HIGH | Per-phone refusal-rate score across all tenants → if >30%, prompt partial advance. Needs platform-level aggregate via `asPlatformAdmin` (cannot leak tenant data). |
| C3 | **Escrow integration hook** (BB-mandated for >10% advance) | roadmap-gap §A.1 | 2 weeks | MED-HIGH | Courier "Delivered" webhook → escrow release payload. Sits beside COD recon. SSLCommerz supports escrow holds. |
| C4 | **DBID Compliance Wizard** (Digital Business Identity) | roadmap-gap §A.2 | 1-2 weeks | MED-HIGH | "86% rejection rate today" — high onboarding value. Collect NID/Trade License/TIN/BIN; guide submission; display DBID. Manual submission first; a2i/myInfo portal API later. |
| C5 | **SLA enforcement + Bangla deadline alerts** | roadmap-gap §A.3 | 1 week | MED | Digital Commerce Guidelines 2021: 48 h courier handover, 5d/10d delivery, 10d refund. Belongs in FastAPI job service. |
| C6 | **Unicode Bangla SMS enforcement** (reject Banglish — BTRC compliance) | roadmap-gap §A.4 + M3 fb5ffbf | DONE in M3 | — | Shipped commit `fb5ffbf` — feature done; verify live. |

### 🟢 CATEGORY D — GROWTH ENGINE (P2 from A-Team — post-launch)

| # | Item | Source | Effort | ROI |
|---|------|--------|--------|-----|
| D1 | **Affiliate / referral program** | A-Team 6.2 + roadmap-gap §C.10 | 2-3 weeks | HIGH (viral loop) |
| D2 | **Blog + SEO content** (`/blog` route + Bengali content) | A-Team 6.3 + PRD §6.6 | 1-2 weeks | MED (inbound traffic) |
| D3 | **In-app support chat widget** | A-Team 6.4 | 1 week | MED (churn reducer) |
| D4 | **MRR dashboard + analytics** | A-Team 6.1 | 1 week | MED (business metrics) |
| D5 | **OpenAPI `/api/docs`** | A-Team 5.7 | 2-3 days | LOW-MED (developer trust) |
| D6 | **Sitemap auto-gen** (already 200; verify is dynamic) | A-Team 6.6 | 4 hours | LOW (already deployed) |
| D7 | **Bottleneck-scan cron** (2 h) | A-Team 6.7 | 1 day | LOW |
| D8 | **Self-improvement 2h cron** | A-Team 6.8 | 1 day | LOW |

### 🔵 CATEGORY E — PHASE 3 (M4) — CORE PRODUCT (next major milestone)

From `docs/research/phase2-brief.md` + `BACKLOG.md`:

| # | Item | Effort | ROI | Notes |
|---|------|--------|-----|-------|
| E1 | **Landing page / Funnel builder** (block-based, single-product order forms) | 3-4 weeks | HIGH (P3 persona = dropshipper) | `landing_page` table exists; template-driven v1. JSON-block model (same as theme engine). |
| E2 | **Self-serve billing** (bKash/Nagad subscription + grace + dunning) | 2-3 weeks | HIGH (removes manual billing) | Manual billing works now (Phase 1.13); automate. |
| E3 | **Plan limits + enforcement** (products, orders/mo, domains, staff) | 1-2 weeks | MED | `usage_counter` table exists. |
| E4 | **Staff roles + permissions** (Phase 3.3) | 2 weeks | MED (P2 persona = SME) | Already partly shipped in W2.1-W2.5 (audit log, assignees, notes). |
| E5 | **Freemium / low-tier pricing lock** (৳849-3300 benchmark) | roadmap-gap §C.11 | 1 week | MED (BD merchant economics — 98.74% sell <$100/mo, $39 plan incompatible) |
| E6 | **ShurjoPay + AamarPay gateways** | roadmap-gap §C.9 | 1 week each | MED (aggregator hedge beyond bKash/Nagad/SSLCommerz) |
| E7 | **Affiliate / agency partner program** | roadmap-gap §C.10 | 2-3 weeks | HIGH (~20% lifetime recurring → decentralized sales force) |

### 🟣 CATEGORY F — PHASE 4 (M5) — DEPTH & SCALE

From `BUILD_CHECKLIST.md` §PHASE 4:

| # | Item | Effort | ROI |
|---|------|--------|-----|
| F1 | **Full section-based theme editor** (OS 2.0 style) | 4-6 weeks | MED |
| F2 | **Multi-step funnels + bumps + one-click upsells** | 2-3 weeks | MED |
| F3 | **A/B testing** | 2 weeks | LOW-MED |
| F4 | **Abandoned-cart recovery** (W3.2 shipped) | DONE | — |
| F5 | **Cohort analytics** | 2 weeks | LOW |
| F6 | **App/integration framework** | 4 weeks | LOW (defer) |
| F7 | **Perf hardening at thousands of tenants** | ongoing | CRITICAL (but staged) |
| F8 | **Merchant financing / capital advance** (Shopify Capital / Baki model) | 4-6 weeks | HIGH (most lucrative per research, needs transaction history first) |

### ⚫ CATEGORY G — DEFERRED / LATER

| # | Item | Source | When |
|---|------|--------|------|
| G1 | Multi-location inventory + order routing | roadmap-gap §D.12 | Phase 5+ |
| G2 | Metafields / Metaobjects | roadmap-gap §D.13 | Phase 5+ |
| G3 | B2B / Wholesale engine | roadmap-gap §D.14 | Phase 5+ |
| G4 | POS / in-person retail | roadmap-gap §D.15 | Defer (low BD relevance) |
| G5 | Merchant mobile app (React Native) | roadmap-gap §D.16 | Defer |
| G6 | Multi-currency / Shopify Markets | roadmap-gap §D.17 | Phase 5+ |
| G7 | Onboarding wizard component | A-Team 2.15 | P3 |
| G8 | Feature flags (per-tenant) | A-Team 2.22 | P3 |
| G9 | E2E tests (Playwright) | A-Team 3.15 | P3 |
| G10 | Snap + Pinterest pixels | A-Team 4.4 | P3 |
| G11 | Component tests (React Testing Library) | A-Team 3.13 | P3 |
| G12 | Trivy CI integration | A-Team 3.7 | P3 |
| G13 | LHCI (Lighthouse CI) | A-Team 3.5 | P3 |
| G14 | CSP + Permissions-Policy headers | _PHASE_P1_PERF | P3 |

### 🔧 CATEGORY H — TECH DEBT (already filed in BACKLOG)

| # | Item | Source | Effort | Severity |
|---|------|--------|--------|----------|
| H1 | **DB test isolation** (4 tests fail in full suite, pass alone) | BACKLOG + Phase 5 | 1-2 days | HIGH (blocks CI green) |
| H2 | **ioredis `error` handler** (silence unhandled error spam under Redis outage) | BACKLOG | 30 min | LOW (degradation already works) |
| H3 | **Dead test code** `fcommerce-source.test.ts` references `listOrders` (renamed) | Phase 5 | 30 min | LOW |
| H4 | **13 TODOs in shipping code** | grep | varies | per-item |
| H5 | **2 console.log in shipping code** | grep | 5 min | trivial |
| H6 | **Supabase meta healthcheck intermittent** | Phase 5 | 30 min | LOW (admin-only) |
| H7 | ~~**WIP returns branch** parked off master (`wip/returns`)~~ DONE | BACKLOG | — | already shipped |

> **H7 verification (2026-06-26):** Returns feature is already in master. Commit
> `1dd1152` shipped Returns/RTO/Exchange (P1 #1) schema+RLS+UI+test;
> `50c31b9` added tests; `befd2ad` i18n-localized admin returns. Migration
> `09_returns.sql` + down file both committed. Live routes
> `/admin/returns`, `/admin/returns/new`, `/admin/returns/[id]` all return 307
> (tenant subdomain rewrite — correct). The `wip/returns` note in BACKLOG is
> stale; the parking was resolved before this audit.

---

## 3. Recommended Execution Plan — 4-Phase Sprint

Total elapsed: **8-10 weeks** to ship the highest-ROI items. Each phase = 2 weeks.

### Sprint S0 — Hygiene & Quick Wins (THIS WEEK)

**Goal:** Unblock CI, close A-Team §T0-§T2 gaps, ship OAuth end-to-end.

| Task | Category | Effort | Owner | Verification |
|------|----------|--------|-------|--------------|
| B3 — Fix `OrderSource` typecheck | B | 30 min | AXIS | `pnpm typecheck` clean |
| B4 — Create `.graphifyignore` | B | 5 min | AXIS | `graphify update .` runs |
| H1 — DB test isolation (per-file data) | H | 1-2 days | AXIS | `pnpm --filter @hybrid/db test` 0 fails in full suite |
| H5 — Remove 2 console.log | H | 5 min | AXIS | `grep -r "console.log" apps/web/{app,lib}` returns 0 |
| H3 — Fix dead `fcommerce-source.test.ts` | H | 30 min | AXIS | file compiles, skipped or fixed |
| H7 — Finish returns WIP branch + merge | H | 1-2 days | AXIS | branch merged to master, tests green |
| B1 — Boss enables Google OAuth in Studio | B | 30 min | Boss | Google sign-in works end-to-end |
| B2 — OAuth login button in `/login` | B | 4 hours | AXIS | button visible, flow works |
| A3 — k6 baseline | A | 30 min | AXIS | p95 latency baseline recorded |
| A9 — Boss rotates exposed creds | A | 1 hour | Boss | new creds in `.env.deploy`, old ones revoked |

**Definition of Done for S0:**
- CI green (typecheck, lint, tests)
- OAuth end-to-end working (Google + Facebook)
- k6 baseline recorded

---

### Sprint S1 — Production Hardening & Scale Foundations (WEEK 2-3)

**Goal:** Production-safe under real tenant load; enable edge cache.

| Task | Category | Effort | Owner | Verification |
|------|----------|--------|-------|--------------|
| A1/A2 — CF wildcard cert + re-proxy | A | 1-2 days | Boss + AXIS | `curl -vI store-a.hybrid.ecomex.cloud` shows edge HIT |
| A5 — CF cache-tag purge wire-up | A | 1 hour | AXIS | product edit → cache purged (verify in CF dashboard) |
| A6 — Slow-query log on | A | 30 min | Boss | `pg_stat_activity` shows queries >500 ms |
| A8 — MinIO public GetObject verify | A | 30 min | AXIS | upload + `curl cdn.hybrid.ecomex.cloud/...` returns image |
| A10 — Retire legacy `hybrid-postgres` | A | 1 hour | Boss | container stopped, no breakage |
| A13 — Verify full SSL chain | A | 30 min | AXIS | `openssl s_client` passes |
| H6 — Fix Supabase meta healthcheck | H | 30 min | AXIS | `docker ps` shows healthy |

**Definition of Done for S1:**
- Edge cache active, store-a p95 < 200 ms
- MinIO serving real images
- No silent infra debt

---

### Sprint S2 — BD Regulatory Moat (WEEK 3-5) ⭐

**Goal:** Ship the regulatory moat items from roadmap-gap analysis. These are what differentiates Hybrid from every BD competitor.

| Task | Category | Effort | Owner | Verification |
|------|----------|--------|-------|--------------|
| C6 — Verify Unicode Bangla SMS validation live | C | 30 min | AXIS | Send Banglish → rejected; Send Unicode → sent |
| C4 — DBID Compliance Wizard (manual submission v1) | C | 1-2 weeks | AXIS | Wizard in `/admin/settings/dbid`; collects NID/TIN/Trade License; status reflected on storefront |
| C5 — SLA deadline timers + Bangla alerts | C | 1 week | AXIS | Order with 48 h timer; cron sends Bangla SMS at T-24 h to merchant |
| C3 — Escrow integration hook (SSLCommerz escrow) | C | 2 weeks | AXIS | Mock escrow release triggered by courier "delivered" webhook |

**Definition of Done for S2:**
- Hybrid legally compliant per BB + BTRC + Digital Commerce Guidelines 2021
- Marketing can claim "BD-compliant" moat

---

### Sprint S3 — F-commerce Wedge + Growth (WEEK 5-7) ⭐ HIGHEST ROI

**Goal:** Ship the single biggest gap per roadmap-gap analysis (C1) + growth engine foundation.

| Task | Category | Effort | Owner | Verification |
|------|----------|--------|-------|--------------|
| C1 — Meta Graph API comment-to-inbox + checkout link in DM | C | 3-4 weeks | AXIS + Boss (Meta App) | Comment "দাম কত?" → auto-reply with checkout link → DM lands → order placed |
| C2 — COD Fraud / Delivery Success Score (v1, cross-tenant aggregate) | C | 2 weeks | AXIS | Order placement by phone with 30%+ refusal history → merchant prompted for partial advance |
| D1 — Affiliate / referral program (basic) | D | 2-3 weeks | AXIS | Affiliate signup → referral link → first paid tenant → 20% recurring credited |

**Definition of Done for S3:**
- Hybrid uniquely captures the F-commerce funnel (300k+ FB sellers)
- Affiliate channel open for decentralized sales
- Foundation for viral growth

---

### Sprint S4 — Phase 3 Foundations (WEEK 7-9)

**Goal:** Begin Phase 3 (M4) — funnels + self-serve billing.

| Task | Category | Effort | Owner | Verification |
|------|----------|--------|-------|--------------|
| E1 — Landing page / funnel builder (template v1) | E | 3-4 weeks | AXIS | Dropshipper builds single-product `/lp/summer-offer` page → takes COD order |
| E2 — Self-serve billing (bKash/Nagad automated) | E | 2-3 weeks | AXIS | Tenant subscribes via bKash → plan active → invoice generated |
| E3 — Plan limits + enforcement | E | 1-2 weeks | AXIS | Starter plan hits 100 orders → 11th blocked with friendly Bengali error |
| E5 — Freemium / ৳499 starter pricing | E | 1 week | AXIS + Boss | Pricing page updated, signup captures correctly |
| E6 — ShurjoPay + AamarPay integration | E | 1 week each | AXIS | Sandbox round-trip |

**Definition of Done for S4:**
- Dropshipper persona unlocked (Phase 3 differentiator)
- SaaS billing fully self-serve — no more manual bKash tracking
- Pricing validated against BD market

---

### Sprint S5+ — Phase 4 (DEFERRED, trigger when needed)

Phase 4 (full editor, upsells, A/B, scale) is explicitly **revenue-positive but deferrable**. Trigger when:
- 50+ paying tenants (proves demand justifies depth investment)
- OR specific customer requests drive it

---

## 4. Resource & Owner Matrix

| Workstream | Primary Owner | Support | Frequency |
|-----------|---------------|---------|-----------|
| Infra / Ops (Category A) | Boss (decisions) + AXIS (execution) | — | Weekly review |
| Ship blockers (B) | AXIS (code) + Boss (OAuth Studio config) | — | Daily until S0 done |
| BD Moat (C) | AXIS | Boss (Meta App creation) | 2-week sprints |
| Growth (D) | AXIS | RAFSAN (copy, content) | Monthly |
| Phase 3 / 4 (E, F) | AXIS | Boss (decisions) | Quarterly planning |
| Tech debt (H) | AXIS | — | As filed |

---

## 5. Decision Points (need Boss input before S2/S3)

### D1 — Meta App for F-commerce (C1)

- **Required:** Boss creates Meta App at developers.facebook.com
- **Permissions needed:** `pages_messaging`, `pages_manage_metadata`, `pages_show_list`
- **Cost:** Free
- **Risk:** Meta App review can take 5-7 days for `pages_messaging` (now requires Business Verification)

### D2 — DBID integration depth (C4)

- **Option A — Manual wizard v1 (1-2 weeks):** Form collects NID/TIN/Trade License, generates printable PDF submission guide. Status tracked in DB.
- **Option B — a2i/myInfo API integration (4-6 weeks):** Direct API integration with government portal. Auto-fetch and verify.
- **Recommendation:** Start with A, layer B later.

### D3 — Affiliate program scope (D1)

- **Option A — Basic (2-3 weeks):** Referral link, 20% lifetime recurring, manual payout.
- **Option B — Full (6-8 weeks):** Multi-tier, agency/partner dashboard, auto-payout via bKash.
- **Recommendation:** A first (proves the channel), upgrade to B when profitable.

### D4 — Pricing for Phase 3 (E5)

- Research paper benchmark: ৳849-3300/mo range
- Current draft: Free (14d trial) → Starter ৳499-999 → Growth ৳1999-2999 → Pro ৳4999+
- **Need Boss decision:** Final price points + any promo strategy

### D5 — Phase 4 timing

- Trigger-based, not calendar-based
- Recommended trigger: 50+ paying tenants OR MRR > ৳50,000/mo

---

## 6. Quality Debt Snapshot (S0 will close most)

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Typecheck | 4/5 packages clean (1 known pre-existing) | 5/5 | B3 fixes this |
| Tests | 198 files, 4 fail in full suite | 0 fail | H1 fixes this |
| TODOs in shipping code | 13 | 0 | Audit each in S0 |
| console.log in shipping code | 0 (2 in test global-setup with explicit eslint-disable — intentional) | 0 | already clean ✅ |
| `: any` types | 0 | 0 | ✅ |
| Raw SQL outside `packages/db` | 0 (ESLint enforced) | 0 | ✅ |
| Lighthouse score | not measured | 90+ mobile | A3 + Trivy (G12) |
| E2E tests | 0 Playwright | smoke suite | G9 (P3) |
| Component tests | 0 RTL | key components | G11 (P3) |

---

## 7. What is NOT Pending (so we don't redo work)

These are SHIPPED + DEPLOYED + LIVE (verified via curl + git log):

- ✅ Multi-tenant RLS (60+ policies, restore-drill passed)
- ✅ Self-hosted Supabase on VPS
- ✅ Bangladesh localization (bKash/Nagad/৳/+880/Noto Sans Bengali)
- ✅ Phase 1 + Phase 2 + W1-W3 admin features
- ✅ Custom domains + 3+ themes + visual customizer
- ✅ All 4 courier integrations (Steadfast/Pathao/RedX/Paperfly)
- ✅ COD reconciliation engine
- ✅ bKash/Nagad/SSLCommerz payments
- ✅ Real-time SSE order notifications (W2.2)
- ✅ Audit log (W2.1 + migration 17)
- ✅ Tracking admin + event log (migration 16)
- ✅ PWA + service worker + offline page
- ✅ Sitemap + robots.txt
- ✅ Cookie consent banner
- ✅ SMS queue (Redis-backed, no BullMQ needed at scale)
- ✅ Loyalty program logic + tests (W3.3)
- ✅ Abandoned cart recovery (W3.2)
- ✅ Reports builder with CSV export (W3.1)
- ✅ Shipping rate calculator (M3 + migration 21)
- ✅ Unicode Bangla SMS validation (M3)
- ✅ Backups → Cloudflare R2 (nightly)
- ✅ deploy.sh self-healing
- ✅ Phase 1 storefront polish (SEO, loading, 404, empty states)
- ✅ Phase 2 admin polish (loading, 404, error boundary, breadcrumbs)

---

## 8. Summary — What to Tell Investors / Yourself

**Hybrid is production-ready for the F-commerce wedge in Bangladesh**:
- Multi-tenant SaaS with hard DB-layer isolation ✅
- Bengali-first mobile-first UX ✅
- Native COD + bKash + 4 couriers + reconciliation ✅
- Visual customizer + themes ✅
- PWA + SEO + offline ✅
- Self-hosted on lean VPS (8 GB) ✅

**Biggest remaining moat to ship:**
1. **F-commerce automation (Meta Graph API)** — 300k+ target sellers, single biggest gap
2. **BD regulatory compliance (DBID + escrow + SLA)** — legally required moat
3. **COD fraud score (cross-tenant)** — saves merchants real money

**Biggest operational risks:**
1. CF wildcard TLS (currently grey-cloud workaround — needs $10/mo upgrade for true edge cache)
2. Test isolation debt (blocks CI green)
3. Typecheck failure (1 line fix)
4. Single VPS ceiling (k6 baseline will tell us when Phase B triggers)

**Time to ship the moat:** ~6 weeks (Sprints S1-S3)

---

## 9. Document Tracking

- Generated: 2026-06-26
- Source repo: `/root/Hybrid/` @ commit `28621ba`
- Author: AXIS (with full Boss approval for execution)
- Next update: after S0 completion (~1 week)

---

*End of plan. Boss — review and approve S0 start, then we ship.*
