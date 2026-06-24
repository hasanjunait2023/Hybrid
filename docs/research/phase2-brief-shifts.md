# Phase 2 Architectural Shifts -- Decision Brief

**Scope:** M3 (Phase 2) mandatory architectural shifts before feature build begins.
**Authored:** 2026-06-24
**Status:** GATE 1 input -- architect + founder action required

---

## SHIFT 1 -- Drop Supabase, Own the Auth + Storage Layer

### Topic 1: Postgres Provider-Agnostic Verification

**Finding**

withTenant() uses sql.begin with set_config(param, value, true) -- the third argument true means
transaction-local: the GUC is cleared on COMMIT/ROLLBACK. This is correct.

**pgBouncer compatibility matrix**

| Connection type | set_config with is_local=true | prepare:false required? |
|---|---|---|
| Direct to Postgres | Yes | Recommended |
| pgBouncer session mode | Yes | Recommended |
| pgBouncer transaction mode | YES -- cleared before pool reclaim | REQUIRED |
| pgBouncer statement mode | No -- do not use | N/A |

set_config with is_local=true is transaction-scoped per PostgreSQL spec. pgBouncer transaction
mode restriction applies to SESSION-level SET/RESET only, not transaction-local set_config.
The existing code is correct. prepare:false is already set in client.ts.

Sources: pgbouncer.org/features.html, citusdata.com/blog/2024/04/04/pgbouncer-supports-more-session-vars/

**Per-provider role creation matrix**

| Provider | Default user | CREATEROLE? | SUPERUSER? | Bookend risk |
|---|---|---|---|---|
| Self-hosted PG16 | postgres (superuser) | Yes | Yes | None |
| Railway | postgres (true superuser) | Yes | Yes | None |
| Neon | neon_superuser (CREATEROLE not SUPERUSER) | Yes | No | Works -- bookend only needs INHERIT+LOGIN |
| AWS RDS | rds_superuser | Yes | No | Same as Neon |

The two-role bookend (app_runtime NOLOGIN group + app_runtime_login LOGIN INHERIT) works on every
listed host. Migration scripts 00_roles.sql + 04_grant_login.sql run via DIRECT_URL (provider admin
user) which has CREATEROLE everywhere. No code changes needed.

Neon operational note: Use the DIRECT (non-pooler) endpoint for DATABASE_URL. The -pooler suffix
adds pgBouncer transaction mode. postgres.js manages its own pool -- no second pooler needed.
Source: neon.com/docs/connect/connection-pooling

**Recommendation:** ZERO code changes to withTenant(), client.ts, or role SQL.
Provider-agnostic concern is already solved.

**Risk HIGH:** Neon neon_superuser cannot grant SUPERUSER. No current migration uses this;
flag as permanent constraint for future migrations.

**Confidence:** HIGH

---

### Topic 2: Own Auth -- Replacing the Supabase Branch

**Finding**

getSession() seam already exists and is correct. AUTH_PROVIDER=supabase branch must be removed;
replaced with AUTH_PROVIDER=password.

**Password Hashing Decision**

| Option | Vercel serverless | Edge Runtime | Verdict |
|---|---|---|---|
| argon2 (node-argon2) | Problematic -- NFT skips prebuilts; workaround needed | No | Avoid |
| @node-rs/argon2 | Works -- napi-rs prebuilts; add serverExternalPackages | No (native) | RECOMMENDED |
| node:crypto scrypt | Works -- zero native deps | No | Safe fallback |

Auth routes run in Node.js runtime (postgres.js dep means not Edge). Use @node-rs/argon2 with
OWASP Argon2id params: memoryCost 19456 KiB, timeCost 2, parallelism 1.
Add serverExternalPackages: ["@node-rs/argon2"] to next.config.ts.

Sources: github.com/vercel/next.js/discussions/65978, npmjs.com/package/@node-rs/argon2

**Session Model: Opaque token in DB (not JWT)**

Table user_session: id uuid PK, user_id FK, token_hash text, expires_at, created_at, ip, user_agent.
Token: randomBytes(32).toString(base64url) -- 256 bits entropy.
Store SHA-256 hash in DB, never the raw token.
Cookie: HttpOnly; Secure; SameSite=Lax; Max-Age=604800 (7 days).
SameSite=Lax (not Strict) -- required for multi-subdomain architecture (admin.myhybrid.com).
Logout = DELETE FROM user_session. Instant revocation. No JWT rotation complexity.

JWT rejected: Cannot revoke a JWT without a blocklist requiring a DB lookup anyway. For a merchant
tool where compromise = must invalidate all sessions, opaque DB tokens are strictly correct.

**CSRF**

Next.js Server Actions compare Origin vs Host header automatically and reject mismatches. POST-only.
Combined with SameSite=Lax this is sufficient for all existing Server Actions.
New auth Route Handlers must add the same Origin check via middleware wrapper.
Source: nextjs.org/blog/security-nextjs-server-components-actions

**OTP Flow (email + phone)**

New table in 06_own_auth.sql:
  otp_code: id uuid PK, user_id uuid FK NULLABLE, target text (phone or email),
            code_hash text (SHA-256 of 6-digit code), purpose text,
            expires_at timestamptz, used boolean, created_at timestamptz
  Index: (target, purpose, expires_at)

OTP: crypto.randomInt(100000, 999999). SHA-256 hash before DB insert.
Expiry: 5 minutes. Rate limit: 3 per target per 10 min (Upstash). Verify: constant-time SHA-256 compare.
user_id is NULLABLE: OTP is sent BEFORE the user row is created at signup step 1.

Chicken-and-egg at signup: Platform sends signup OTP via platform sms.net.bd (existing SmsAdapter,
platform api_key). COD always available as zero-credential payment on day 1.
Tenant configures own creds in Settings AFTER provisioning.

**getSession() changes**

AUTH_PROVIDER=dev: UNCHANGED (HMAC dev cookie, local only, production-gated)
AUTH_PROVIDER=password: NEW -- reads hybrid_session cookie, SHA-256 lookup in user_session, checks expires_at
AUTH_PROVIDER=supabase: REMOVED entirely. Remove @supabase/ssr from package.json.

resolveActiveTenantId() helper reused unchanged by the password branch.

**Recommendation:** Implement AUTH_PROVIDER=password as production default. Remove Supabase branch.
Add user_session + otp_code in 06_own_auth.sql.

**Risk MEDIUM:** Argon2id uses ~19MB per invocation. Acceptable -- signup/login are rare paths.
Offload to FastAPI if concurrency pressure observed.

**Confidence:** HIGH

---

### Topic 3: S3-Compatible BlobStore

**Finding**

@aws-sdk/client-s3 + @aws-sdk/s3-request-presigner works against R2, B2, S3, MinIO via endpoint
override. The existing BlobStore interface (put/remove) requires no changes.

S3BlobStore additions (~80 lines):
- Config: S3_BUCKET, S3_ENDPOINT (empty=AWS S3), S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
- Key prefix: {tenantId}/{uuid}.{ext} -- same naming as LocalBlobStore, different backend
- Upload: server-side PutObjectCommand via existing /api/admin/upload route (5MB max, validated)
- For R2: endpoint = https://{ACCOUNT_ID}.r2.cloudflarestorage.com, region = auto
- Public URL stored verbatim in product_image.url (existing contract unchanged)
- Dynamic import inside getBlobStore() to avoid cold start size penalty

Platform bucket (theme previews, platform assets): PLATFORM_S3_* env vars, separate bucket.
Source: developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/

Note: R2 presigned URLs only work with S3 API domain, not custom R2 domains. Irrelevant for
server-side upload path recommended here.

**Recommendation:** Add S3BlobStore to lib/storage/. BLOB_DRIVER=s3 for production.
LocalBlobStore unchanged for local dev.

**Risk LOW:** @aws-sdk/client-s3 is ~450KB gzipped. Mitigated by dynamic import.

**Confidence:** HIGH

---

### Topic 4: 05_auth.sql -- Drop It

**Finding**

05_auth.sql contains handle_new_auth_user() and on_auth_user_created trigger (guarded by auth schema
existence). With Supabase Auth dropped, the trigger has no caller. On plain Postgres the guard
means it was never registered anyway.

**Recommendation:** Remove 05_auth.sql from migrate.ts execution list. Add 06_own_auth.sql for
user_session + otp_code tables. Optionally add DROP FUNCTION IF EXISTS public.handle_new_auth_user()
to 06_own_auth.sql. provisionTenant() inserts app_user via asPlatformAdmin directly -- no change.

**Confidence:** HIGH

---

### Topic 5: Env Var Changes

**Remove (Supabase-only):**
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
BLOB_DRIVER=supabase option removed
AUTH_PROVIDER=supabase option removed

**Add (own auth + S3):**
AUTH_PROVIDER=password             (new production default; keep dev for local)
SESSION_SECRET=                    (32+ random bytes; fail-fast if unset)
SESSION_MAX_AGE_SECONDS=604800     (7 days)
PLATFORM_SMTP_HOST=                (optional; defer if SMS-only OTP)
PLATFORM_SMTP_PORT=587
PLATFORM_SMTP_USER=
PLATFORM_SMTP_PASS=
PLATFORM_FROM_EMAIL=noreply@myhybrid.com
BLOB_DRIVER=s3                     (local for dev, s3 for production)
S3_BUCKET=hybrid-product-images
S3_ENDPOINT=                       (empty=AWS S3; full URL for R2/B2/MinIO)
S3_REGION=auto
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
PLATFORM_S3_BUCKET=hybrid-platform-assets
PLATFORM_S3_ENDPOINT=
PLATFORM_S3_REGION=auto
PLATFORM_S3_ACCESS_KEY_ID=
PLATFORM_S3_SECRET_ACCESS_KEY=

**Keep unchanged:**
DATABASE_URL, DIRECT_URL, REDIS_URL, NEXT_PUBLIC_ROOT_DOMAIN
DEV_SESSION_SECRET (dev local only), APP_ENCRYPTION_KEY
CRON_SECRET, SMS_LIVE, SMS_API_KEY
VERCEL_API_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID

---

## SHIFT 2 -- Per-Tenant Credential Model (All Providers)

### Topic 6: Extension of the Crypto + Settings Pattern

**Finding**

Phase 1 proved sealCredentials/openCredentials per-tenant pattern for bKash and Steadfast.
payment_account and courier_account tables have credentials jsonb columns.
The pattern extends to all new providers with two design exceptions.

**Payment Providers**

bKash Tokenized Checkout: {app_key, app_secret, username, password} -- FITS. Done in P1.
Callback URL server-derived from tenant verified domain (P1 harden fix). No change.

Nagad: {merchant_id, merchant_private_key, nagad_public_key} -- FITS.
Nagad uses per-merchant RSA key pairs (NOT OAuth). merchant_private_key is a PEM block (~1.7KB);
AES-256-GCM handles arbitrary JSON size (add unit test for large payload in crypto.test.ts).
GOTCHA HIGH UX RISK: Nagad requires tenant to manually whitelist callback URL in merchant portal.
Hybrid cannot automate this. Settings UI must display exact URL with copy button + Test Connection.
Exact URL pattern: https://{tenant-domain}/api/payments/nagad/callback
Source: scribd.com/document/684746071/Nagad-Online-Payment-API-Integration-Guide-v3-3

SSLCommerz: {store_id, store_password} -- FITS.
GOTCHA HIGH UX RISK: IPN URL must be manually registered in SSLCommerz merchant panel.
Display exact IPN URL: https://{tenant-domain}/api/payments/sslcommerz/ipn with copy button.
Source: developer.sslcommerz.com

**Courier Providers**

Steadfast: {api_key, api_secret} -- FITS. Already done P1.

Pathao: {client_id, client_secret} -- PARTIAL FIT with adapter-managed OAuth2.
Pathao uses OAuth2 token grant. Tenant pastes client_id + client_secret (long-lived API creds).
Adapter performs OAuth2 grant at first use and caches {access_token, refresh_token, expires_at}
in Redis at key pathao:token:{tenantId} with TTL = token expiry.
The sealed credential holds only {client_id, client_secret}.
Token lifecycle is adapter-managed, transparent to tenant.
Source: github.com/pathao-eng/courier-woocommerce-plugin, pypi.org/project/pathao-courier-api/

RedX: credential structure UNKNOWN. No public API docs found. LOW CONFIDENCE.
Paperfly: credential structure UNKNOWN. No public API docs found. LOW CONFIDENCE.
Founder must contact both directly. Do not block M3 build on these adapters.

**SMS (tenant-side, post-signup)**
sms.net.bd: {api_key} -- FITS. Tenant pastes own api_key for customer notifications.
Platform uses its own platform-level api_key for signup OTPs. Clean separation.

**Providers requiring design exceptions:**

1. Pathao OAuth2: token lifecycle adapter-managed. Architect picks:
   Redis key pathao:token:{tenantId} PREFERRED (TTL auto-managed, no migration needed)
   vs courier_account.token_cache jsonb column (durable but needs ALTER TABLE migration).

2. Nagad + SSLCommerz callback/IPN URL manual registration: UX step only, not technical blocker.
   Settings UI must surface the URL prominently with copy button, instructions, Test Connection.

**Chicken-and-egg at signup:** Platform sends OTP via platform sms.net.bd. COD available as
zero-credential payment on day 1. Tenant configures own creds in Settings after provisioning.

**Recommendation:** Existing sealCredentials/openCredentials pattern extends cleanly.
Build NagadProvider + SSLCommerzProvider in @hybrid/payments following BkashProvider pattern.
Build PathaoProvider in @hybrid/couriers with Redis token cache following SteadfastProvider pattern.

**Confidence:** HIGH for bKash/Steadfast/Nagad/SSLCommerz. MEDIUM for Pathao (OAuth2 inferred).
LOW for RedX/Paperfly (no public docs).

---

## Decisions Needed from Architect

1. Production PG host: Railway (true superuser, simplest ops) vs Neon (scale-to-zero) vs self-hosted.
   Code works on all. Pick one as canonical for DEPLOY.md.
2. user_session in Postgres DB vs Redis. DB recommended (revocable, durable, no TTL edge cases).
3. Confirm otp_code.user_id NULLABLE -- yes required. OTP sent before user row exists at signup step 1.
4. Pathao token cache: Redis key pathao:token:{tenantId} PREFERRED vs courier_account.token_cache column.
5. Platform SMTP provider if email OTP desired in P2: Resend / SendGrid / raw SMTP.
   If deferred, SMS-only OTP is sufficient for Phase 2.
6. Add serverExternalPackages: ["@node-rs/argon2"] to next.config.ts when auth implementation lands.
7. Confirm DROP FUNCTION IF EXISTS public.handle_new_auth_user() is safe in 06_own_auth.sql (yes).

---

## Decisions Needed from Founder

1. S3-compatible provider for production blobs.
   RECOMMENDATION: Cloudflare R2 -- no egress fees (Vercel + R2 on Cloudflare network),
   10GB free tier, AWS SDK v3 compatible, well-documented.
   Alternatives: Backblaze B2 (cheapest per-GB at /usr/bin/bash.006), AWS S3 (simplest if already on AWS).

2. Platform SMTP provider for signup email OTP.
   RECOMMENDATION: Defer to Phase 3. SMS-only OTP via existing sms.net.bd platform key is
   sufficient for Phase 2. Avoids adding SMTP dependency and account setup to Phase 2 scope.

3. Session duration: 7 days proposed. Confirm. Longer = less re-login friction for mobile merchants.

4. Postgres production host.
   RECOMMENDATION: Railway -- cheapest, true superuser, simplest ops, no Neon CREATEROLE edge cases.

5. RedX + Paperfly API docs: founder must contact both directly before adapters can be built.
   Do not block M3 on these. Pathao ships first; RedX/Paperfly follow after docs received.

6. Nagad + SSLCommerz merchant account timelines: KYC + portal registration needed for both.
   Adapters can be built and unit-tested against mocks while accounts are pending.

---

## Open Risks / Unknowns

| Risk | Severity | Mitigation |
|---|---|---|
| RedX/Paperfly API docs not publicly available | MEDIUM | Founder contacts both; block adapters until docs received |
| Nagad PEM key (~1.7KB) in sealCredentials untested at large size | LOW | Add unit test in crypto.test.ts; AES-256-GCM handles arbitrary JSON |
| Pathao OAuth2 token refresh under Redis cold cache | MEDIUM | Retry with backoff in PathaoProvider; surface Courier credentials invalid to admin UI |
| @node-rs/argon2 native binary on Vercel Linux x64 | LOW | serverExternalPackages is documented fix; node:crypto.scrypt fallback ready |
| Nagad/SSLCommerz callback URL manual step -- tenants skip it; payments fail silently | HIGH | Prominent Required setup step in Settings UI; Test Connection button; copy-paste instructions |
| otp_code.user_id nullable design | LOW | Confirmed: must be nullable; architect must confirm before writing 06_own_auth.sql |
| Platform SMTP not selected -- signup email OTP blocked | MEDIUM | SMS-only OTP at signup fully mitigates for Phase 2 scope |
| Neon neon_superuser SUPERUSER grant restriction | LOW | No current migration uses it; flag as permanent constraint for future DDL authors |

---

*End of Phase 2 Architectural Shifts Brief*
*File: d:/BD shopify/docs/research/phase2-brief-shifts.md*
