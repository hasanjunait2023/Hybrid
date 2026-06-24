# Hybrid — Phase 2 (M3) Architecture Blueprint (GATE 1 input, 2026-06-24)

Builds ONLY on shipped Phase-0/1 contracts (withTenant/asPlatformAdmin, getSession() seam, sealCredentials/openCredentials, placeOrder idempotent txn, middleware route groups + resolveTenantByHost, unstable_cache + revalidateTag, BlobStore). Canonical 01_schema.sql/02_policies.sql are NOT edited — all Phase-2 DDL ships as new migration files (06+). Honors docs/research/phase2-brief-shifts.md and docs/research/phase2-brief-features.md. M3 = the two mandatory architectural shifts (Wave 0) + Phase-2 features 2.1 through 2.8.

## Approach

Phase 2 has two foundational shifts that must land first because every feature wave consumes them. SHIFT 1 drops Supabase entirely: own auth with Argon2id plus an opaque DB-backed session token behind the EXISTING getSession() seam, add an S3-compatible BlobStore driver behind the EXISTING BlobStore interface, drop 05_auth.sql, add 06_own_auth.sql. SHIFT 2 extends the proven sealCredentials per-tenant credential pattern to every new provider (Nagad/SSLCommerz, Pathao, WhatsApp, tenant SMS, analytics secrets) via admin Settings. After Wave 0, the eight features fan out into three feature waves grouped by independence and shared file ownership: domains + theme catalog/customizer + discounts are mostly independent (Wave 1); multi-courier + COD reconciliation share @hybrid/couriers and shipment/cod_remittance (Wave 2); analytics + WhatsApp share the post-commit notify pattern (Wave 3). Almost everything is local-testable at the data/logic layer; live integrations stay behind env flags and founder-obtained accounts, exactly as Phase 1 deferred bKash-prod/Steadfast-live.

## GATE-1 decisions (CEO autonomous defaults — founder may override)

1. Auth: AUTH_PROVIDER=password becomes the production default (Argon2id via @node-rs/argon2, OWASP params m=19456/t=2/p=1). AUTH_PROVIDER=dev (HMAC dev-login) stays the local default, unchanged and production-gated. AUTH_PROVIDER=supabase is REMOVED.
2. Session: opaque 256-bit token, SHA-256 hashed in user_session (Postgres, not Redis — revocable, durable, no TTL edge cases). Cookie hybrid_session: HttpOnly; Secure; SameSite=Lax (required for admin.* / app.* subdomain navigation); Max-Age 604800 (7 days, founder-confirmable).
3. OTP: SMS-only at signup for Phase 2 (email/SMTP deferred to Phase 3). Platform sends signup OTP via the platform sms.net.bd key. otp_code.user_id is NULLABLE (OTP precedes the app_user row at signup step 1). COD is the zero-credential day-1 payment.
4. Blobs: BLOB_DRIVER=s3 (production) via @aws-sdk/client-s3 endpoint-override; local stays the dev default. Recommended provider: Cloudflare R2 (no egress, free tier, SDK-v3 compatible).
5. Pathao token cache: Redis key pathao:token:{tenantId} with TTL = token expiry (no migration; adapter-managed). Sealed cred holds only {client_id, client_secret, username, password}.
6. Themes: draft/publish via the two-row tenant_theme_settings model (one is_active=true live, one is_active=false draft); the existing tenant_theme_one_active partial unique index is honored (swap-on-publish is one transaction). 3 starter themes (founder sign-off): Doreja (general, exists), Megh (fashion/editorial), Bazar (electronics/dense). Constrained customizer only — any drag-and-drop / custom-HTML request is Phase 4, refuse it.
7. Custom domains: build full UI + data layer + state machine behind VERCEL_DOMAINS_ENABLED flag; live Vercel API calls deferred (Pro plan + token required).
8. Production PG host: Railway canonical for DEPLOY.md (true superuser, simplest bookend ops). Neon constraint (neon_superuser cannot grant SUPERUSER) flagged for future DDL authors; no current migration needs it.

---

## 1. New / changed DB tables + migrations (each new tenant table gets an RLS policy)

Migration files are added; migrate.ts pickFiles already globs !03_ so 06/07 are picked up automatically. 05_auth.sql is dropped from the execution list (remove from disk or add DROP FUNCTION IF EXISTS public.handle_new_auth_user() in 06; the trigger guard means it was never registered on plain Postgres anyway).

### packages/db/sql/06_own_auth.sql (SHIFT 1 — own auth)

```
user_session
  id uuid pk default gen_random_uuid()
  user_id uuid not null references app_user(id) on delete cascade
  token_hash text not null            -- SHA-256(base64url(randomBytes(32))); raw token NEVER stored
  expires_at timestamptz not null
  ip text, user_agent text
  created_at timestamptz not null default now()
  revoked_at timestamptz              -- logout = set revoked_at (or hard DELETE)
  index (token_hash)                  -- the hot lookup path
  index (user_id)                     -- "log out all sessions"

otp_code
  id uuid pk default gen_random_uuid()
  user_id uuid references app_user(id) on delete cascade   -- NULLABLE (precedes user at signup)
  target text not null                -- phone (E.164) or email
  code_hash text not null             -- SHA-256 of 6-digit code
  purpose text not null               -- signup | login | reset
  expires_at timestamptz not null     -- now() + 5 min
  used boolean not null default false
  created_at timestamptz not null default now()
  index (target, purpose, expires_at)

app_user  ALTER add column password_hash text   -- Argon2id; nullable for dev-era rows (decision #A)
```

RLS for user_session and otp_code: these are GLOBAL-identity tables (no tenant_id), like app_user. They must NOT join the tenant_tables isolation loop. Auth lookups run via asPlatformAdmin (the only context that can read across users before a tenant is resolved — same rationale as resolveActiveTenantId). Policy: enable + force RLS, then a self-or-admin SELECT/write policy keyed on user_id = app.current_user_id() OR app.is_platform_admin(). For otp_code the verify path runs under asPlatformAdmin (user_id may be null pre-signup), so its policy is effectively admin-gated writes; never expose otp rows to tenant context. Grants are REQUIRED, not optional: the alter default privileges in 02_policies.sql only applies to objects created by the role that ran it (DIRECT_URL/postgres in 02). New tables created in a LATER migration need an explicit grant select,insert,update,delete on user_session, otp_code to app_runtime; at the end of 06.

### packages/db/sql/07_phase2.sql (feature columns — additive ALTERs only)

```
-- 2.6 COD reconciliation: three batch-state columns the engine needs
alter table cod_remittance
  add column status text not null default pending   -- pending | processed | failed
  add column processed_at timestamptz
  add column unmatched_count integer not null default 0;
```

Tables already sufficient as shipped (no DDL, confirmed against 01_schema.sql):
- 2.1 tenant_domain — ssl_status enum (none/pending/issued/failed) + verified + verification_token cover the full state machine. No new columns.
- 2.2/2.3 theme + tenant_theme_settings — tenant_theme_one_active partial unique index supports two-row draft/publish. sections_schema jsonb stays EMPTY in Phase 2 (Phase-4 free-editor seam). Customizer JSON lives in tenant_theme_settings.settings.
- 2.4 discount — fully defined (code/type/value/min_subtotal/usage_limit/used_count/per_customer_limit/applies_to/window/status). No change.
- 2.5 courier_account.credentials — Pathao OAuth creds + city/zone/area defaults seal into the existing jsonb. courier_provider enum already includes pathao/redx/paperfly.
- 2.6 shipment — cod_amount/cod_collected/cod_remitted/cod_status/reconciled/discrepancy_amount/remittance_id all exist.
- 2.7 analytics_event — exists. Analytics provider IDs/secrets live in tenant.settings.analytics (sealed secrets via crypto), no table.
- 2.8 WhatsApp — creds live in tenant.settings.notifications.whatsapp (sealed), no table (reuses the RLS-protected tenant.settings jsonb).

All 07_phase2.sql changes are on an already-RLS-protected table — no new policies; the existing cod_remittance_isolation policy applies to the new columns.

---

## 2. New packages / modules + the contracts they publish

### SHIFT 1 — Own Auth + S3 storage

- packages/db/src/crypto.ts — UNCHANGED contract. Add a unit test for a large (~1.7KB PEM) payload to crypto.test.ts (Nagad merchant_private_key). AES-256-GCM already handles arbitrary JSON size.
- apps/web/lib/auth/password.ts (new) — hashPassword(plain) and verifyPassword(hash, plain) via @node-rs/argon2 (Argon2id m=19456/t=2/p=1). Add serverExternalPackages [@node-rs/argon2] to apps/web/next.config.ts. node:crypto.scrypt documented as fallback.
- apps/web/lib/auth/session.ts (extend the EXISTING seam) — add AUTH_PROVIDER=password branch: read hybrid_session cookie, SHA-256, lookup user_session via asPlatformAdmin, check expires_at > now() and revoked_at is null, resolveActiveTenantId (reused unchanged), return Session{userId,tenantId}. Add createSession(userId, req) and destroySession(). REMOVE the getSupabaseSession branch and @supabase/ssr dep. dev branch UNCHANGED, production-gated.
- apps/web/lib/auth/otp.ts (new) — issueOtp(target, purpose, userId?) (crypto.randomInt(100000,999999), SHA-256, insert; 5-min expiry; Upstash rate-limit 3/target/10min reusing lib/ratelimit.ts) and verifyOtp(target, purpose, code) (constant-time SHA-256 compare, mark used). Signup OTP via platform SmsAdapter (platform key).
- apps/web/app/api/auth/* Route Handlers (new) — /login, /signup, /logout, /otp/request, /otp/verify. POST-only; each wrapped by requireSameOrigin() comparing Origin vs Host (Server Actions get this free; Route Handlers must add it explicitly). Rate-limited via lib/ratelimit.ts.
- apps/web/lib/storage/s3.ts (new) — S3BlobStore implements BlobStore (same put/remove contract). Config: S3_BUCKET/S3_ENDPOINT/S3_REGION/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY. Key {tenantId}/{uuid}.{ext} (identical to LocalBlobStore). Server-side PutObjectCommand via the existing /api/admin/upload route (5MB cap + mime/filename validation UNCHANGED — reuse validate()/assertTenantId()). getBlobStore() adds a case s3 with a DYNAMIC import of @aws-sdk/client-s3. Platform bucket (theme previews) uses PLATFORM_S3_*.
- apps/web/lib/auth/provision.ts (extend) — password path: OTP-verify, createAppUser (exists) + write password_hash, provisionTenant, createSession. createAppUser takeover guard (created flag) stays load-bearing.

### SHIFT 2 — Per-tenant credentials (all providers)

- @hybrid/payments (extend, still PURE — no Next/DB/env, fetch injectable):
  - NagadProvider — creds {merchant_id, merchant_private_key (PEM), nagad_public_key}. RSA per-merchant (NOT OAuth). PaymentProvider contract unchanged. Callback https://{tenant-domain}/api/payments/nagad/callback requires MANUAL whitelist in the Nagad portal (Settings shows exact URL + copy + Test Connection).
  - SSLCommerzProvider — creds {store_id, store_password}. IPN https://{tenant-domain}/api/payments/sslcommerz/ipn manually registered (same Settings UX).
  - New callback Route Handlers /api/payments/nagad/callback + /api/payments/sslcommerz/ipn mirror the bKash callback (execute + amount verify + webhook_event replay guard + payment_provider_ref_uniq).
- @hybrid/couriers (extend, still PURE):
  - Widen provider literal to steadfast | pathao | redx | paperfly.
  - Add optional courierArea { cityId?, zoneId?, areaId? } to ConsignmentInput (Steadfast ignores it).
  - Extend CourierCreds with optional Pathao fields {clientId, clientSecret, username, password, tokenExpiry?} (existing Steadfast {apiKey, secretKey} callers unaffected).
  - PathaoProvider — OAuth2 grant at first use; token cached in Redis pathao:token:{tenantId} (TTL=expiry) via an INJECTED tokenStore (keeps the package PURE — no Redis import; the app injects it, same pattern as bKash). Refreshed token re-sealed + written back via a caller-provided refreshCallback (adapter stays DB-free). getStatus returns in_transit fallback until a live endpoint is confirmed. Geography city_id -> zone_id -> area_id from Pathao area-list API, TTL-cached.
  - RedxProvider / PaperflyProvider — SKELETON only (interface-conformant, throw NOT_CONFIGURED). Live build deferred — no public docs (founder action).
- tenant SMS — tenant pastes own sms.net.bd api_key in Settings (sealed). Platform key stays for signup OTP. No SmsAdapter contract change.
### Feature modules (apps/web)

- 2.1 apps/web/lib/domains/vercel.ts (new) — addDomain/verifyDomain/getDomainStatus over Vercel REST (POST /v10/projects/{id}/domains, POST /v9/.../verify, GET /v9/.../domains/{domain}). Behind VERCEL_DOMAINS_ENABLED; flag-off writes tenant_domain + returns DNS instructions WITHOUT calling Vercel. State machine maps to existing enum: pending_dns(verified=false,ssl=none) -> dns_verified(verified=true,ssl=pending) -> ssl_issued(ssl=issued, call invalidateDomainCache) -> failed. DNS: apex A->76.76.21.21, www CNAME->VERCEL_CNAME_TARGET env. CAA-missing -> user-facing error path. NO middleware/resolve.ts change — resolveTenantByHost already routes any verified tenant_domain.
- 2.2/2.3 apps/web/lib/theme/schema.ts (new) — ThemeSettingsSchema (Zod), four keys: colors{primary,accent,background,surface,text} (5 hex max), typography{headingFont,bodyFont} (enum of 3-4 self-hosted WOFF2 fonts in packages/ui/ — NO arbitrary URLs), content{storeName,logoUrl,heroHeadline,heroSubline,heroCta,heroImageUrl}, sections[]{type(enum: hero|featured_products|collections_grid|trust_band|announcement_bar), enabled, position}. Validated in the Server Action before any DB write (Bengali error). Draft/publish + ?preview=<draftId> (admin-session-gated server-side — info-disclosure if missed). Storefront renders via the EXISTING getTenantContextBySlug path (extend to read the full settings object, not just colors) + revalidateTag(tenant:{id}:theme) on publish.
- 2.4 discount apply — extend PlaceOrderInput with discountCode (string or null). Inject into the EXISTING placeOrder txn AFTER the reserveLine loop (subtotal known) and BEFORE the orders INSERT: SELECT ... FOR UPDATE the discount row, validate window/status/usage_limit/min_subtotal/per_customer_limit/applies_to scope, compute discount_total (percentage capped at subtotal; fixed_amount=min(value,subtotal); free_shipping zeroes shipping), grandTotal = subtotal - discount_total + effectiveShipping, UPDATE discount SET used_count = used_count + 1 (same txn, atomic rollback). Populate the already-present orders.discount_code/orders.discount_total. No client-side preview. Typed errors DISCOUNT_BELOW_MINIMUM, DISCOUNT_USAGE_LIMIT, DISCOUNT_NOT_APPLICABLE, DISCOUNT_INVALID (Bengali-mapped).
- 2.6 apps/web/lib/cod/recon.ts + apps/web/lib/cod/parsers/steadfast.ts (new) — CsvParser interface parse(csv) returns ParsedLine array; SteadfastCsvParser first (columns confirmed against a real report — flagged). Matching Server Action (all writes via withTenant, 500-row cap): ingest -> one cod_remittance row/batch (raw CSV in payload) -> match each line by normalized-trim consignment_id + tenant_id -> set cod_collected/cod_remitted/remittance_id -> discrepancy_amount = cod_amount - cod_remitted -> cod_status = reconciled (zero) or discrepancy (non-zero) -> unmatched counted in unmatched_count, batch status=processed. Large files offload to the FastAPI seam (Phase 2+); synchronous fine at launch.
- 2.7 apps/web/lib/analytics/ (new) — events.ts (taxonomy: view_item/add_to_cart/initiate_checkout client-only; purchase dual-fire), ga4.ts (Measurement Protocol POST /mp/collect), meta-capi.ts (CAPI Purchase). purchase dedup: UUID v4 returned as analyticsEventId on PlaceOrderResult; client fires fbq with eventID + GA4 gtag; server fires CAPI + GA4-MP NON-BLOCKING post-commit (the notifyOrderPlaced void-promise pattern). _ga cookie forwarded server-side. event_id stored in payment.payload for audit. Internal order.placed/product.viewed/cart.added -> analytics_event. Flag-gate externals GA4_ENABLED/CAPI_ENABLED.
- 2.8 apps/web/lib/whatsapp/ (new) — WhatsAppAdapter.sendOrderConfirmation(phone, templateVars, creds) -> POST /v17.0/{phone_number_id}/messages (approved Utility template). Creds {wabaId, phoneNumberId, accessToken} sealed in tenant.settings.notifications.whatsapp. Wired post-order-placed ALONGSIDE SMS (additive, per-tenant opt-in, non-blocking). Manual cred entry in Phase 2 (Embedded Signup is Phase 3). Bengali template authored + submitted to Meta by founder (24-48h — critical path).
---

## 3. Wave sequencing with strict file-ownership boundaries

BE = backend-engineer, FE = frontend-engineer, DES = design-dependent (theme/visual sign-off). File sets are non-overlapping so parallel agents never collide — the same discipline that built P0/P1.

### WAVE 0 — Architectural shifts foundation (BLOCKING; publishes contracts every later wave consumes)

| Slice | Owner | Files (exclusive) | Publishes |
|---|---|---|---|
| S-AUTH-DB | BE | packages/db/sql/06_own_auth.sql, drop 05_auth.sql from list, app_user ALTER (password_hash) | user_session/otp_code tables + RLS + grants |
| S-AUTH-CORE | BE | apps/web/lib/auth/password.ts, otp.ts, session.ts (password branch; remove supabase), next.config.ts, remove @supabase/ssr | getSession() password provider, createSession/destroySession, OTP |
| S-AUTH-ROUTES | BE+FE | apps/web/app/api/auth/*, requireSameOrigin helper, login/signup/logout UI | auth Route Handlers (CSRF Origin check) |
| S-S3-BLOB | BE | apps/web/lib/storage/s3.ts, getBlobStore() case s3 | S3BlobStore |
| S-CRED-PROVIDERS | BE | @hybrid/payments (Nagad/SSLCommerz), @hybrid/couriers (Pathao + union widening + ConsignmentInput.courierArea + CourierCreds Pathao fields; RedX/Paperfly skeletons), crypto.test.ts large-PEM test | extended provider contracts |
| S-ENV | BE | .env.example, turbo.json globalEnv, CLAUDE.md env/auth-seam sections | new env surface |

W0 gate: full 63-test DB suite green + new auth/session/otp/crypto-large-PEM tests green. Provisioning + signup now run end-to-end on the password provider locally.

### WAVE 1 — Independent feature slices (BE+FE+DES parallel; depend only on W0)

| Slice | Owner | Files (exclusive) | Notes |
|---|---|---|---|
| S-DOMAINS | BE+FE | apps/web/lib/domains/vercel.ts, app/(admin)/admin/settings/domains/*, Server Actions | Behind VERCEL_DOMAINS_ENABLED; no middleware/resolve.ts edit |
| S-THEME-CATALOG | BE+DES | packages/db/sql/03_seed.sql (+Megh/Bazar theme rows), packages/ui/src/components/storefront/themes/* (3 distinct React trees), self-hosted WOFF2 fonts | Themes differ in component tree, not just tokens |
| S-THEME-CUSTOMIZER | BE+FE | apps/web/lib/theme/schema.ts, app/(admin)/admin/customizer/*, draft/publish Server Action, ?preview route (admin-gated), extend lib/storefront/data.ts to read full settings | Consumes S-THEME-CATALOG section types; constrained only |
| S-DISCOUNTS | BE+FE | app/(admin)/admin/discounts/* (CRUD), placeOrder.ts discount injection, checkout.test.ts discount cases | Owns the one placeOrder.ts edit this wave |

Ownership note: only S-DISCOUNTS edits placeOrder.ts; only S-THEME-CUSTOMIZER edits lib/storefront/data.ts. No overlap.

### WAVE 2 — Courier + COD (BE-heavy; share @hybrid/couriers + shipment/cod_remittance)

| Slice | Owner | Files (exclusive) | Notes |
|---|---|---|---|
| S-PATHAO-WIRE | BE | apps/web/lib/couriers/pathao.ts (app adapter + Redis tokenStore inject + refreshCallback), lib/couriers/send.ts (multi-provider dispatch), courier settings UI Pathao geography dropdowns | Consumes PathaoProvider from W0 |
| S-COD-RECON | BE+FE | packages/db/sql/07_phase2.sql (cod_remittance cols), apps/web/lib/cod/recon.ts, lib/cod/parsers/*, app/(admin)/admin/cod/settlements/* (COD & Settlements view) | Owns 07 migration; reads shipment rows S-PATHAO-WIRE writes |

W2 ordering: S-COD-RECON owns 07_phase2.sql + lib/cod/*; S-PATHAO-WIRE owns lib/couriers/*. No file overlap.

### WAVE 3 — Notifications + analytics (share post-commit notify pattern)

| Slice | Owner | Files (exclusive) | Notes |
|---|---|---|---|
| S-ANALYTICS | BE+FE | apps/web/lib/analytics/*, PlaceOrderResult.analyticsEventId, checkout success page dual-fire, settings Analytics section | Flag-gated GA4/CAPI |
| S-WHATSAPP | BE+FE | apps/web/lib/whatsapp/*, post-order-placed wiring (additive to SMS), settings WhatsApp section | Manual creds; template founder-submitted |

S-ANALYTICS owns the single PlaceOrderResult edit (analyticsEventId); S-WHATSAPP only reads the post-commit hook.

Build order: W0 -> (W1 parallel W2 once W0 packages land) -> W3. Cache tags reuse tenant:{id}:theme + :cod (both already in the scheme); no new tags. One PR extends the CLAUDE.md env table + auth-seam section.
---

## 4. Sacred invariants preserved

- RLS on every new tenant table — cod_remittance columns inherit the existing isolation policy; user_session/otp_code are global-identity (self-or-admin policy, accessed only via asPlatformAdmin), never in tenant context. New tables get an explicit grant ... to app_runtime (default privileges do not cover objects created by DIRECT_URL in a later migration).
- withTenant() only — every tenant read/write stays on withTenant/asPlatformAdmin; the no-raw-sql ESLint rule is untouched and still build-breaking. Auth/domain/host lookups (cross-tenant by nature) use asPlatformAdmin, consistent with resolve.ts/provision.ts.
- Sealed creds — Nagad/SSLCommerz/Pathao/WhatsApp/tenant-SMS/analytics-secrets all seal via the existing sealCredentials; raw secrets never logged or rendered. Public IDs (fbPixelId, ga4MeasurementId) stay plaintext.
- Idempotent checkout unchanged — discount logic is purely additive inside the existing txn; atomic inventory decrement, server-side pricing, payment_txn_uniq, webhook_event replay guard, and the COD/bKash state machine are untouched. FOR UPDATE on the discount row is the only new lock.
- No stubs in shipping code — RedX/Paperfly skeletons throw NOT_CONFIGURED (explicit, not silent); every other path is wired end-to-end against real DB/services or a flag-gated live seam with a real local test.
- Mobile-first + Bengali-first — customizer, COD settlements, discount errors, OTP, WhatsApp all ship Bengali; tap targets >=44px; bottom-sheet dialogs.

---

## 5. Edge cases / failure modes + local-testable vs live-deferred

| Feature | Key edge cases and failure modes | Local-testable now | Live-deferred (tested without account) |
|---|---|---|---|
| Own auth | Argon2 ~19MB/call (rare path, OK; FastAPI offload if pressure); SameSite=Strict breaks subdomain nav -> Lax; revocation on compromise; Origin-check on Route Handlers | hash/verify, session mint/lookup/revoke, OTP issue/verify/expiry/rate-limit, CSRF reject — embedded-pg + unit | none (fully ownable locally) |
| S3 blob | endpoint-override correctness; R2 presign vs custom-domain caveat (irrelevant, server-side upload); SDK cold-start (dynamic import) | LocalBlobStore covers dev; optional MinIO contract test | R2/B2 prod bucket (swap BLOB_DRIVER, same interface) |
| 2.1 Domains | Vercel verified=true BEFORE cert usable (two states); 48h apex propagation (communicate in UI); CAA missing letsencrypt.org -> silent SSL fail (user-facing error); CNAME project-specific (env); Pro-plan gate | full UI + state machine + DB + cache invalidation (flag off; /etc/hosts for custom-host routing) | Vercel API call, TXT verify, SSL issuance, CNAME retrieval (flag on + token) |
| 2.2/2.3 Theme | stale draftId if draft deleted outside Server Action (managed-delete only); ?preview unauthenticated leak (admin-gate server-side — adversarial flag); arbitrary font URL (enum only); scope creep to drag-drop (refuse -> Phase 4) | full: schema, Zod, draft/publish swap, preview gate, storefront render from JSON | logo upload to prod S3 (LocalBlobStore covers dev) |
| 2.4 Discounts | concurrent usage-limit race (FOR UPDATE); free_shipping needs non-null shipping (enforce when applied); percentage > subtotal (cap); per_customer_limit count; applies_to scope mismatch | fully local — add cases to checkout.test.ts | none |
| 2.5 Multi-courier | Pathao OAuth refresh under cold Redis (retry+backoff, surface creds-invalid to admin); geography ID staleness (TTL cache + Refresh button); RedX auth model UNKNOWN; Paperfly no sandbox | Pathao adapter against stage env (hermes-api.p-stageenv.xyz); contract tests (stub fetch) for shape+map; Steadfast unchanged | Pathao live (merchant acct), RedX (confirm auth first), Paperfly (skeleton only) |
| 2.6 COD recon | fee deduction vs genuine discrepancy (Phase 2: flag all non-zero, merchant decides); partial_delivered legit lower COD (check raw_status); consignment-ID zero-pad/format mismatch (normalize trim); unmatched lines (count, manual review); >500 rows (FastAPI offload) | fully local against hand-crafted CSVs | real Steadfast CSV column names (founder provides scrubbed report before parser ships) |
| 2.7 Analytics | _ga cookie missing -> (not set) attribution (forward server-side); GA4-MP maintenance mode (migrate to Data Manager API at Phase 3); fbAccessToken rotation if compromised (sealed) | settings, event gen, dedup wiring, internal analytics_event writes (flag-gated externals) | GA4 console measurement, FB Events Manager dedup verify (test event code) |
| 2.8 WhatsApp | template approval on critical path (founder submits early; 24-48h, can reject); per-tenant WABA setup friction (opt-in, additive to SMS); BD per-msg pricing unconfirmed | adapter structure, template var formatting, settings, cred seal/unseal | Meta API call, template approval, Embedded Signup (Phase 3) |
---

## 6. Open decisions for the CEO / founder

Architect-confirmable (CEO can autonomously default):
- #A password_hash: add column to app_user in 06 (recommended, simplest; app_user is global-identity, RLS already self-or-admin) vs separate user_credential table. Default: column on app_user.
- #B Session 7 days — confirm (longer = less re-login friction for mobile merchants).
- #C Pathao token cache: Redis key (recommended, no migration) vs courier_account.token_cache column. Default: Redis.
- #D CourierCreds Pathao extension: optional fields (recommended, backward-compatible) vs discriminated union. Default: optional fields.
- #E Confirm 02_policies.sql grants allow UPDATE discount.used_count and INSERT analytics_event under app_runtime_login (both covered by the schema-wide grant — verify in W0).

Founder action required (block specific live integrations, NOT the M3 build):
1. Vercel plan — confirm Pro+ (Domains API gate). If not, custom-domain live path waits; local build proceeds.
2. 3 theme directions — sign off Doreja/Megh/Bazar (or alternates) so DES can scaffold the three component trees.
3. WhatsApp Bengali template — author + submit to Meta NOW (24-48h, critical path; do not leave to the last week).
4. Pathao merchant/stage creds — provide for contract testing against the stage env.
5. Real Steadfast remittance CSV (scrubbed) — required before the CSV parser ships (do not build on assumed columns).
6. RedX + Paperfly API docs — founder contacts both; adapters stay skeletons until docs arrive (do not block M3).
7. Nagad + SSLCommerz merchant accounts — KYC/portal in flight; adapters built + unit-tested against mocks meanwhile.
8. S3 provider — R2 recommended; confirm.
9. Production PG host — Railway recommended; confirm for DEPLOY.md.
10. Facebook Business Manager / Meta App — confirm CAPI access (ads_management + business_management).

---

## Phase-2 DoD

Custom domain connects with SSL (live, creds permitting; locally simulated end-to-end behind flag); a seller picks one of 3 themes and customizes colors/fonts/content/section-order via the constrained customizer with draft->publish; a discount code applies inside the idempotent checkout txn preserving oversell + server-pricing guarantees; a Pathao consignment is created (stage env) behind the unified courier interface; COD reconciliation ingests a remittance CSV, matches by consignment_id, and flags a real discrepancy in the COD & Settlements view; GA4 + Pixel/CAPI purchase fires once (deduped); WhatsApp order confirmation sends (template + creds permitting). Auth runs fully on the owned password provider — no Supabase. RLS suite + all per-slice embedded-pg suites green. No stubs (RedX/Paperfly explicit NOT_CONFIGURED skeletons are the only deferred adapters).
