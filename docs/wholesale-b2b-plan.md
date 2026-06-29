# Hybrid Wholesale B2B Plan

> Adding a wholesaler (পাইকারি) channel to Hybrid, aligned with the existing "Bazar" marketplace architecture.
> Date: 2026-06-29
> Owner: AXIS for Junait ভাই

## 1. Executive Summary

Hybrid has two existing commerce surfaces:

1. **Tenant Storefront** — each `tenant` gets its own branded store on a subdomain, managed via `/admin`. This is the original "Shopify for Bangladesh" model.
2. **Marketplace (Bazar)** — a cross-vendor discovery layer at `/market` where buyers browse products from multiple tenants and checkout creates one **parent marketplace order** + **per-vendor sub-orders**. Catalog is a denormalized projection (`marketplace_listing`), and buyer identity (`marketplace_customer`) is separate from seller identity (`app_user`).

This plan adds a **wholesale** business type so that:

- A tenant can operate as a **retailer** (existing), a **wholesaler** (new), or **both**.
- Wholesalers list products with **MOQ** and **tier pricing**.
- Retailers (and other B2B buyers) can buy from wholesalers through the marketplace, or directly through the wholesaler's own storefront.
- The marketplace gets two sections: **Retail** and **Wholesale**.
- Everything is controlled from the existing platform super-admin dashboard.

## 2. Bangladesh Wholesale Context

| Domain | Local reality |
|---|---|
| Pricing | Trade/MRP gap, tiered unit price by quantity (10/50/100 pcs) |
| MOQ | Per-SKU minimum, sometimes mixed-carton rules |
| Buyers | Retailers, distributors, small shop owners — need trade license, BIN, phone verification |
| Orders | Purchase order → quotation → approval → delivery (not always instant checkout) |
| Credit | Credit limit, current due, partial payment, cash, bKash, bank transfer |
| Documents | Cash memo, delivery challan, invoice with BIN/VAT |
| Delivery | Bulk by own transport / courier / 3PL; multi-godown |
| Mobile | Android-first; everything must work smoothly on mobile |

Reference models: IndiaMART, Udaan, local cash-memo / challan workflow.

## 3. Existing Architecture (as discovered 2026-06-29)

### 3.1 Tenant model
- `tenant` table = one store. No business-type distinction yet.
- RLS via `withTenant(tenantId, userId, tx => ...)` + `app.current_tenant_id`.
- Middleware routes: `app.` → platform, `admin.` → admin, other subdomains → storefront (`/_sites/[tenant]`).

### 3.2 Marketplace model
- Catalog projection: `marketplace_listing` + `marketplace_listing_variant` (world-readable).
- Sync: `lib/marketplace/sync.ts` reads tenant products via `withTenant()` and writes projection via `asPlatformAdmin()`.
- Buyer: `marketplace_customer` (phone natural key) + `marketplace_session` (opaque cookie).
- Orders: `marketplace_order` (buyer-owned) + `marketplace_suborder` (per-vendor snapshot).
- Checkout: `placeMarketplaceOrder()` groups cart by vendor and calls `placeOrder()` per vendor with `channel='marketplace'`.
- Reviews: `marketplace_review` moderated by vendors.

This means the marketplace **does not** read cross-tenant data at request time. We leverage that same projection model for wholesale.

## 4. Proposed 3-System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PLATFORM SUPER ADMIN                      │
│  (tenants, plans, billing, marketplace analytics, KYC)      │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   ┌─────────┐       ┌──────────┐       ┌──────────────┐
   │ Retail  │       │ Wholesale│       │  Marketplace │
   │ System  │◄─────►│  System  │◄─────►│   (Bazar)    │
   │(existing│       │ (new)    │       │  /market     │
   │ + tune) │       │          │       │              │
   └─────────┘       └──────────┘       └──────────────┘
        │                   │
        ▼                   ▼
   admin.{slug}        admin.{slug}
   storefront          storefront
   (B2C checkout)      (B2B PO/quote/ledger)
```

### 4.1 Retail System
Unchanged default. Existing tenants become `business_type = 'retail'`. Storefront and admin behave exactly as today.

### 4.2 Wholesale System
A tenant with `business_type` in `('wholesale', 'both')` gets:
- Same admin panel, but with a **Wholesale** section.
- Products can be marked `is_wholesale = true` and carry MOQ + tier prices.
- Customers can be tagged as B2B buyers (`retailer`, `distributor`, `wholesaler`) with trade license, BIN, credit limit, current due.
- Orders can be `order_mode = 'wholesale'` with purchase-request / quotation / credit flow.
- Storefront supports B2B login, wholesale price visibility, and bulk checkout.

### 4.3 Marketplace (Bazar)
The existing `/market` route is split into:
- **Retail section** — products from retail tenants, normal checkout for end consumers.
- **Wholesale section** — products from wholesale tenants, MOQ + tier pricing, B2B login required to see wholesale prices.

A retailer can browse the wholesale section, add products from multiple wholesalers to one cart, and place a wholesale marketplace order. Order routing still respects tenant isolation — each wholesaler sees only their own sub-order.

## 5. Data Model Changes

All changes are additive. No existing table is redefined in a way that breaks existing rows.

### 5.1 Tenant business type and KYC

```sql
create type tenant_business_type as enum ('retail','wholesale','both');
alter table tenant add column business_type tenant_business_type not null default 'retail';

-- For wholesalers who need platform approval before listing
alter table tenant add column kyc_status text not null default 'pending';
alter table tenant add column kyc_documents jsonb not null default '[]'::jsonb;
alter table tenant add column wholesale_approved boolean not null default false;
```

Existing tenants become `retail` automatically.

### 5.2 Product catalog

`product`:
- `is_wholesale boolean not null default false`
- `moq integer`
- `wholesale_only boolean not null default false`

`product_variant`:
- `wholesale_price numeric(14,2)`
- `tier_prices jsonb not null default '[]'::jsonb` — `[{"min_qty": 10, "unit_price": 85.00}, ...]`
- `moq integer`

### 5.3 Marketplace listing projection

`marketplace_listing`:
- `is_wholesale boolean not null default false`
- `moq integer`
- `wholesale_only boolean not null default false`
- `price_from` continues to show the lowest active variant price (consumer price for retail, wholesale minimum for wholesale).

`marketplace_listing_variant`:
- `wholesale_price numeric(14,2)`
- `tier_prices jsonb`
- `moq integer`

The sync function (`lib/marketplace/sync.ts`) is updated to project these new fields.

### 5.4 Customers / B2B buyers

For the tenant-scoped seller customer list (`customer`):

`customer`:
- `customer_type customer_type not null default 'end_consumer'`
- `business_name text`
- `trade_license_no text`
- `bin_no text`
- `credit_limit numeric(14,2) not null default 0`
- `current_due numeric(14,2) not null default 0`
- `is_verified boolean not null default false`

New type:
```sql
create type customer_type as enum ('end_consumer','retailer','distributor','wholesaler');
```

For the marketplace buyer identity (`marketplace_customer`), add:
- `business_name text`
- `trade_license_no text`
- `bin_no text`
- `customer_type text not null default 'end_consumer'`
- `is_verified boolean not null default false`

### 5.5 Orders

`orders`:
- `order_mode order_mode not null default 'retail'`
- `is_purchase_order boolean not null default false`
- `po_reference text`
- `credit_approved boolean not null default false`
- `credit_due numeric(14,2) not null default 0`
- `credit_terms jsonb not null default '{}'::jsonb

New type:
```sql
create type order_mode as enum ('retail','wholesale');
```

### 5.6 Purchase request + quotation (new table)

```sql
create table purchase_request (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  buyer_customer_id uuid not null references customer(id) on delete cascade,
  status text not null default 'draft', -- draft | submitted | quoted | accepted | rejected | converted
  items jsonb not null default '[]'::jsonb,
  quoted_subtotal numeric(14,2),
  quoted_total numeric(14,2),
  expires_at timestamptz,
  converted_order_id uuid references orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 5.7 Credit ledger (new table)

```sql
create table customer_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  customer_id uuid not null references customer(id) on delete cascade,
  type text not null, -- sale | payment | credit_note | debit_note
  amount numeric(14,2) not null,
  balance numeric(14,2) not null,
  reference_type text,
  reference_id uuid,
  note text,
  created_at timestamptz not null default now()
);
```

## 6. RLS & Security

- All new tenant-scoped tables (`purchase_request`, `customer_ledger`) get the standard RLS policy: `tenant_id = app.current_tenant_id() OR app.is_platform_admin()`.
- `marketplace_listing` and `marketplace_listing_variant` remain world-readable for the public browse section.
- Wholesale prices in the projection can be shown publicly only with `wholesale_only = false`; for `wholesale_only = true` or tier details, require a verified B2B buyer session.
- `business_type` is a business-logic flag, not a security boundary. RLS still isolates by `tenant_id`.
- Platform admin can read cross-tenant marketplace data via `asPlatformAdmin()`.

## 7. UI/UX Structure

### 7.1 Admin panel (same panel, conditional nav)

For `business_type = 'wholesale' | 'both'`, add a **Wholesale** section:
- `/admin/wholesale/products` — wholesale product list + MOQ/tier price editor
- `/admin/wholesale/customers` — B2B buyers + credit limit + verification
- `/admin/wholesale/orders` — wholesale orders + purchase requests
- `/admin/wholesale/ledger` — customer ledger
- `/admin/wholesale/settings` — wholesale defaults (tax, terms, delivery)

For `business_type = 'retail'`, hide the wholesale section.

### 7.2 Wholesaler storefront

Same themed storefront, but when buyer is a verified B2B customer:
- Show MOQ and tier prices.
- Allow bulk add-to-cart with minimum quantity enforcement.
- Checkout supports purchase request / credit order.

### 7.3 Marketplace `/market`

- Top-level tabs: **Retail** | **Wholesale**
- Retail section: existing grid, consumer prices, normal cart.
- Wholesale section: wholesale grid, MOQ visible, tier price shown only after B2B login.
- Wholesale product detail pages show login-gated pricing.
- Wholesale checkout creates a `marketplace_order` whose sub-orders are `order_mode = 'wholesale'`.

## 8. Marketplace Sync Changes

Update `lib/marketplace/sync.ts` to project:
- `is_wholesale`, `moq`, `wholesale_only` into `marketplace_listing`
- `wholesale_price`, `tier_prices`, `moq` into `marketplace_listing_variant`
- Filter logic: a product with `wholesale_only = true` is still synced, but the marketplace UI will hide it from the Retail section.

## 9. Phased Implementation Roadmap

### Phase 1 — Foundation (Week 1)
Goal: safe schema + types + RLS, no UI yet.

- [ ] Add `tenant_business_type`, `customer_type`, `order_mode` enums.
- [ ] Add wholesale columns to `tenant`, `product`, `product_variant`, `customer`, `orders`.
- [ ] Add wholesale columns to `marketplace_listing` and `marketplace_listing_variant`.
- [ ] Add `purchase_request` and `customer_ledger` tables.
- [ ] Add `marketplace_customer` B2B columns.
- [ ] Update `02_policies.sql` / new migration to enable RLS on new tables.
- [ ] Regenerate `packages/db/src/types.ts`.
- [ ] Update `provisionTenant` to accept `business_type`.
- [ ] Update `lib/marketplace/sync.ts` to project wholesale fields.
- [ ] Verify: `pnpm db:test` passes, typecheck passes, build passes.

### Phase 2 — Wholesaler Admin (Week 2)
Goal: a wholesaler can manage wholesale products, B2B customers, and view wholesale orders.

- [ ] Conditional admin nav by `business_type`.
- [ ] Wholesale product list + create/edit with MOQ + tier prices.
- [ ] B2B customer list + credit limit + verification flag.
- [ ] Wholesale order list (`order_mode = 'wholesale'` filter).
- [ ] Customer ledger read-only view.
- [ ] Verify with a seeded wholesale tenant.

### Phase 3 — Marketplace Sections (Week 3)
Goal: `/market` supports Retail and Wholesale sections.

- [ ] Add section tabs and filters to marketplace home + search + category.
- [ ] Wholesale product card with MOQ + tier price.
- [ ] Wholesale product detail with B2B login gate for prices.
- [ ] Wholesale marketplace checkout (`order_mode = 'wholesale'` on sub-orders).
- [ ] B2B buyer verification flow.

### Phase 4 — Purchase Orders + Credit (Week 4)
Goal: B2B buyers can request quotes, wholesalers can approve, and credit orders are tracked.

- [ ] Purchase request create/submit UI.
- [ ] Wholesaler quotation/approval flow.
- [ ] Convert approved quote to wholesale order.
- [ ] Credit limit check at checkout.
- [ ] Ledger auto-updates on sale and payment.
- [ ] Payment types: partial, bKash, bank transfer, cash.

### Phase 5 — Platform Super Admin (Week 5)
Goal: Junait ভাই can manage the whole hybrid ecosystem from the platform dashboard.

- [ ] Tenant list filter by `business_type`.
- [ ] Wholesaler KYC approval queue.
- [ ] Marketplace analytics: retail vs wholesale GMV, product views, conversion.
- [ ] Platform commission/fee ledger for wholesale marketplace transactions.
- [ ] Document export (cash memo, challan, invoice).

## 10. MVP Cut (ship faster)

Minimum sellable unit:
- Wholesaler can add products with MOQ + tier prices.
- Marketplace has a Wholesale section.
- A logged-in B2B buyer can see wholesale prices and place a simple wholesale order.

That means **Phase 1 + core Phase 2 + core Phase 3**. Purchase orders, credit ledger, and KYC queue come next.

## 11. Conflict Mitigation

| Risk | Mitigation |
|---|---|
| Retail vs wholesale price confusion | Separate `unit_price` (retail) and `wholesale_price` + `tier_prices`. UI surfaces the right price based on `business_type` + buyer type. |
| One tenant selling both retail and wholesale | `business_type = 'both'`. Product-level `wholesale_only` flag controls marketplace visibility. |
| Cross-tenant data leak | Marketplace reads world-readable projection; admin/vendor reads use `withTenant()`; platform reads use `asPlatformAdmin()`. No raw `sql` for tenant data. |
| Marketplace cart mixing vendors | Cart stored per vendor; checkout creates separate `orders` rows per tenant, grouped under one `marketplace_order`. |
| Credit risk | Hard `credit_limit` check at order creation; ledger updates atomically in the same transaction. |
| Mobile UX | Reuse existing mobile-first components; bulk quantity steppers optimized for touch. |
| Sync drift | `syncMarketplaceListing` called on product save + backfill cron; reconcile cron repairs misses. |

## 12. Open Decisions for Boss

1. **Tenant type strictness**: Should a single tenant be allowed to be `both`, or strict `retail` vs `wholesale` accounts at signup?
2. **Marketplace commission on wholesale**: Percentage per transaction, monthly fee, or both?
3. **B2B buyer verification**: Manual KYC approval before a buyer sees wholesale prices?
4. **Credit from day 1**: Built-in ledger from MVP, or cash/bKash only in the first release?
5. **Wholesale pricing visibility**: Hide all wholesale prices until login, or show MOQ + "login for price"?

## 13. Next Step

Start **Phase 1: Foundation**. Execute schema migration `24_wholesale.sql`, update marketplace projection columns, regenerate types, and run the full test/typecheck/build gauntlet.
