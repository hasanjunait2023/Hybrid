# Hybrid — Architecture Reference

Concise reference, current as of Phase 1. Read `docs/architecture/phase1-blueprint.md` for the
full approved Phase 1 blueprint and decision rationale. Read `docs/PRD.md` for product context.

---

## Multi-tenancy model

Every tenant table carries a `tenant_id UUID` column. Row-level security is enforced in
Postgres via a session-local GUC:

```sql
-- Set per transaction by withTenant():
SELECT set_config('app.current_tenant_id', '<uuid>', true);
```

RLS policies filter every row by `tenant_id = current_setting('app.current_tenant_id')::uuid`.
The `true` argument makes the setting transaction-local — it is cleared on `COMMIT` or
`ROLLBACK` and never leaks across pooled connections.

### Two-role split

```
app_runtime       NOLOGIN  — holds all table grants (the canonical role in 02_policies.sql)
app_runtime_login LOGIN    — inherits app_runtime; this is what DATABASE_URL connects as
postgres          SUPERUSER — DIRECT_URL; used only for migrations, seed, type gen
```

`app_runtime_login` is a non-superuser. When it connects, `FORCE ROW LEVEL SECURITY`
policies engage on all tables. Migrations and seed run as `postgres` (superuser, bypasses
RLS) via `DIRECT_URL`. This split is the NOLOGIN-defect fix: see `00_roles.sql` and
`04_grant_login.sql`.

### `withTenant()` contract

```ts
// packages/db/src/withTenant.ts
withTenant(tenantId, userId, (tx) => Promise<T>): Promise<T>
```

Opens a `sql.begin()` transaction, sets the three GUCs (`app.current_tenant_id`,
`app.current_user_id`, `app.is_platform_admin`), executes the callback with the transaction
handle `tx`, and commits. A thrown error triggers automatic rollback with no GUC residue.
`prepare: false` is set on the postgres.js client — required for pgBouncer/Supavisor
transaction-mode pooling.

`asPlatformAdmin()` sets `app.is_platform_admin = 'true'` and empty tenant/user GUCs.
Used for host→tenant resolution and tenant provisioning.

### ESLint guard

`packages/config/eslint/no-raw-sql.mjs` bans `import 'postgres'` and
`import '@hybrid/db/client'` in all consumer packages. A direct import of the postgres.js
driver bypasses the GUC setup and silently leaks cross-tenant data. This rule is a
build-breaking error.

---

## Request flow

```
Browser request (store-a.lvh.me:3000/products)
  |
  v
middleware.ts  (Node.js runtime, runs on every non-asset request)
  |  reads Host header
  |  strips port -> "store-a.lvh.me"
  |
  +-- ROOT (lvh.me)              -> NextResponse.next()  [marketing route group]
  +-- sub == "app"               -> rewrite /platform/*  [super-admin route group]
  +-- sub == "admin"             -> rewrite /admin/*     [tenant admin route group]
  +-- otherwise: resolveTenantByHost(host)
        |
        +-- Redis cache hit ("domain:store-a.lvh.me" -> {id, slug})  -> use cached
        +-- Redis miss -> asPlatformAdmin DB lookup:
              SELECT t.id, t.slug
              FROM tenant_domain d JOIN tenant t ON t.id = d.tenant_id
              WHERE d.domain = $host AND d.verified = true AND t.status = 'active'
              LIMIT 1
            -> cache result TTL 1h (MISS sentinel TTL 60s)
        |
        +-- null -> rewrite /store-not-found
        +-- {id, slug} -> rewrite /_sites/{slug}{pathname}
  |
  v
_sites/[tenant]/layout.tsx
  getTenantContextBySlug(slug)   [unstable_cache, tags: tenant:{id}, tenant:{id}:theme]
    -> asPlatformAdmin: SELECT tenant + active theme_settings
    -> sets CSS vars (--color-primary, --color-accent) from theme JSON
  |
  v
_sites/[tenant]/page.tsx  (or /products/page.tsx)
  getStorefrontProducts(tenantId)  [unstable_cache, tags: tenant:{id}, tenant:{id}:products]
    -> withTenant(tenantId, null, tx => SELECT products WHERE status='active')
    -> RLS filters to tenantId only
  |
  v
React Server Component renders Doreja theme sections
  StoreHeader, Hero, ProductGrid, ProductCard, TrustBand, StoreFooter
  (all from @hybrid/ui)
  |
  v
Response -> browser
```

---

## Admin edit to storefront ISR loop

```
Admin Server Action (apps/web/app/(admin)/admin/products/[id]/edit/actions.ts)
  1. getSession()            -> verify HMAC dev cookie -> {userId}
  2. resolveTenantByHost()   -> tenant {id, slug} (from request headers)
  3. withTenant(tenantId, userId, tx => UPDATE product SET title=..., price=...)
  4. revalidateTag(`tenant:${tenantId}:products`)
     revalidateTag(`tenant:${tenantId}:product:${productId}`)
  -> Next.js purges the unstable_cache entries for those tags
  -> next request to the storefront re-runs the DB query and renders fresh data
```

No rebuild required. ISR on-demand revalidation is the mechanism.

### Cache-tag scheme

| Tag | Scope |
|---|---|
| `tenant:{id}` | All tenant data (broad bust) |
| `tenant:{id}:products` | Product list |
| `tenant:{id}:product:{pid}` | Individual product |
| `tenant:{id}:collections` | Collection list |
| `tenant:{id}:orders` | Order list / status changes |
| `tenant:{id}:order:{oid}` | Individual order |
| `tenant:{id}:customers` | Customer list / counters |
| `tenant:{id}:dashboard` | Dashboard metrics (also revalidates on product/order mutations) |
| `tenant:{id}:cod` | COD collection list |
| `tenant:{id}:theme` | Theme settings |
| `tenant:{id}:page:{slug}` | Store page content |
| `tenant:{id}:navigation` | Navigation |
| `tenant-slug:{slug}` | Slug to ID resolution |

Production note: `unstable_cache` is per-instance on Vercel. Replace with the Upstash
cache handler before deploying to production (Phase 2 task; the cache is isolated to
`lib/storefront/data.ts` — one file change).

---

## Package boundaries

```
apps/web
  depends on: @hybrid/db (withTenant, asPlatformAdmin, crypto, types)
              @hybrid/payments (BkashProvider, CodProvider — Phase 1)
              @hybrid/couriers (SteadfastProvider — Phase 1)
              @hybrid/ui (storefront components, tokens)
              @hybrid/config (ESLint, tsconfig, Tailwind preset)

packages/db   (@hybrid/db)
  owns: postgres.js connections, withTenant, SQL files, migrate, crypto (AES-256-GCM), types
  exports: withTenant, asPlatformAdmin, adminSql, sealCredentials, openCredentials, generated types
  does NOT export: client.ts (the raw postgres.js handle)

packages/payments  (@hybrid/payments)
  owns: BkashProvider (Tokenized Checkout), CodProvider
  pure — no Next.js, no DB, no env imports; fetch is injectable for testing
  exports: BkashProvider, CodProvider, PaymentState, PaymentProvider interface

packages/couriers  (@hybrid/couriers)
  owns: SteadfastProvider (create consignment, get status, get balance), statusMap
  pure — no Next.js, no DB, no env imports; fetch is injectable for testing
  exports: SteadfastProvider, CourierAdapter interface, statusMap

packages/ui   (@hybrid/ui)
  owns: design tokens (globals.css), Doreja storefront sections, shared primitives
  added Phase 1: StatusBadge, StatusStepper, safeUrl
  no db dependency

packages/config  (@hybrid/config)
  owns: ESLint configs (incl. no-raw-sql), tsconfig bases, Tailwind preset
  no runtime dependency
```

---

## Phase 1 data flows

### Checkout (COD or bKash) — one atomic `withTenant` transaction

```
Storefront checkout form (POST to Server Action)
  1. upsertCustomerByPhone()          — insert or update customer record
  2. address upsert                   — insert or reuse shipping address
  3. per-item inventory decrement     — atomic: UPDATE ... WHERE inventory_quantity >= qty RETURNING id
                                        0 rows → throw INSUFFICIENT_STOCK → ROLLBACK (no oversell)
  4. INSERT orders                    — order_number assigned by per-tenant DB trigger
  5. INSERT order_items               — prices copied from DB variant records (never client-supplied)
  6. INSERT payment                   — payment.id = idempotency key / merchantInvoiceNumber
  7. increment customer counters

  COD path: payment_status=unpaid, cod_amount=total → commit → SMS post-commit (non-blocking)
  bKash path: payment_status=pending → commit → BkashProvider.createPayment() → return bkashURL

/api/bkash/callback  (server-side, after bKash popup)
  1. INSERT webhook_event (provider, external_id=paymentID) ON CONFLICT DO NOTHING
     → only the winning insert executes; duplicate webhooks are discarded
  2. BkashProvider.executePayment() → trxID, amount
  3. Verify amount paisa-exact vs payment.grand_total → mismatch → set failed, return
  4. UPDATE payment status=success, trxID stored
  5. UPDATE order status=confirmed
```

### bKash callback server-side verification (payment integrity, hardening commit 031f925)

The amount returned by bKash `execute` is compared against the amount stored at order creation
(computed server-side from DB variant prices). Client-supplied amounts are never trusted. A
mismatch sets `payment_status = failed` and never triggers order confirmation.

### Billing state machine

```
provisioning → subscription: trialing, trial_ends_at = now() + 14d, tenant.status = active

/api/internal/billing-sweep (CRON_SECRET, run by cron)
  evaluateTenantBilling(subscription, now):
    trialing  + period_end < now  → past_due  (tenant stays active — 3-day grace)
    past_due  + period_end + 3d < now → suspended → tenant.status = suspended
    active    + period_end < now  → past_due
    suspended / cancelled / expired → no-op

  On suspend: tenant.status = suspended, subscription.status = expired,
              invalidateDomainCache() flushes the Redis host cache
```

Storefront enforcement is free — `resolveTenantByHost()` already requires `tenant.status = 'active'`.
Suspended tenants get a 404, not another tenant's data.

### Courier wire (Steadfast)

```
Admin "Send to Steadfast" button (Server Action)
  1. openCredentials(tenant courier_account) → {apiKey, secretKey}
  2. SteadfastProvider.createConsignment(order, creds) → {consignmentId, trackingCode}
  3. UPDATE order: courier_ref=consignmentId, tracking_code=trackingCode, status=shipped

/api/internal/courier-sync (CRON_SECRET)
  1. SELECT in-transit orders with courier_ref
  2. SteadfastProvider.getStatus(cid, creds) per order
  3. UPDATE order status per statusMap (pending→created, in_transit, delivered, cancelled, etc.)
```

No COD remittance API exists for Steadfast in Phase 1. The COD collection list in the admin
shows outstanding amounts; reconciliation is manual until Phase 2.

---

## Auth seam

`apps/web/lib/auth/session.ts` exports one function: `getSession(): Promise<Session | null>`.

**Phase 0/1 default:** HMAC-SHA256-signed dev cookie (`hybrid_dev_session`).
Set by the `/dev-login?as=owner-a|owner-b|admin` route. Disabled in production
(`NODE_ENV === 'production'` returns null immediately). Constant-time compare prevents
timing oracles. `DEV_SESSION_SECRET` must be set.

**Phase 1 Supabase branch:** Set `AUTH_PROVIDER=supabase` to activate the Supabase
`@supabase/ssr` path. `packages/db/sql/05_auth.sql` adds the `on_auth_user_created` trigger
that inserts an `app_user` row when Supabase creates an auth user. The seam is dormant until
a Supabase instance (Docker or cloud) is configured.

**Phase 2+ swap:** Callers (`admin layout`, Server Actions) are unchanged. The `getSession()`
signature is the stable seam — the body is the only thing that changes.

---

## Where Phase 2+ plugs in

| Phase | What plugs in |
|---|---|
| Phase 2 | Vercel Domains API + `invalidateDomainCache()`; theme catalog + visual customizer; Supabase Storage blob driver; COD reconciliation |
| Phase 3 | Funnel builder (JSON block model); self-serve bKash billing; plan limits |
| Phase 4 | Full section editor; multi-step funnels; Upstash cache handler for multi-instance ISR |

---

## Local dev topology

```
localhost:3000  Next.js dev server (pnpm dev)
localhost:5432  Postgres 16 (docker-compose postgres service)
                  app_runtime_login:app_runtime_local_pw/hybrid  <- DATABASE_URL
                  postgres:postgres/hybrid                        <- DIRECT_URL
localhost:6379  Redis 7 (docker-compose redis service)           <- REDIS_URL

*.lvh.me -> 127.0.0.1  (all browsers, no /etc/hosts required)
  store-a.lvh.me:3000  ->  middleware  ->  /_sites/store-a/*
  store-b.lvh.me:3000  ->  middleware  ->  /_sites/store-b/*
  admin.lvh.me:3000    ->  middleware  ->  /admin/*
  app.lvh.me:3000      ->  middleware  ->  /platform/*  (super-admin)
  lvh.me:3000          ->  middleware  ->  marketing + /signup (no rewrite)

Phase 1 test suite (63 tests):
  embedded-postgres (npm) on a random free port — no Docker or system PG needed
  pnpm --filter @hybrid/db test
  Covers: RLS isolation, crypto seal/open, checkout idempotency, billing state machine,
          payment amount verification, courier wiring, provisioning, tenant liveness

Live-deferred integrations (accounts/infra required):
  bKash sandbox round-trip  — BKASH_SANDBOX=1 + founder sandbox credentials
  Steadfast live             — merchant account (no sandbox exists)
  SMS live send              — SMS_LIVE=1 + sms.net.bd account + sender masking
  Supabase Auth              — AUTH_PROVIDER=supabase + Docker or cloud instance
```
