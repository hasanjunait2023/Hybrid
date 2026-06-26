-- ============================================================================
-- Hybrid Storefront — Multi-Tenant Commerce Platform ("Shopify for Bangladesh")
-- PostgreSQL Schema (DDL)        |  File 1 of 2  (run BEFORE 02_policies.sql)
-- ----------------------------------------------------------------------------
-- Multi-tenant, single-database design. Every tenant-scoped table carries a
-- `tenant_id` so Row-Level Security (see 02_policies.sql) isolates tenants at
-- the database layer via the `app.current_tenant_id` session variable.
--
-- Conventions:
--   * UUID primary keys (gen_random_uuid()) except very high-volume event/log
--     tables which use bigint identity.
--   * timestamptz everywhere, stored in UTC.
--   * Money: numeric(14,2), currency BDT by default.
--   * tenant.id IS the tenant_id used across all tenant-scoped tables.
--   * Reserved words avoided (orders, not "order"; analytics_event, not event).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;      -- case-insensitive email/slug/domain
create extension if not exists pg_trgm;     -- fuzzy search on product titles etc.

-- ---------------------------------------------------------------------------
-- 1. Shared helper: updated_at auto-touch
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Enumerated types
-- ---------------------------------------------------------------------------
create type tenant_status            as enum ('trial','active','past_due','suspended','cancelled');
create type domain_type              as enum ('subdomain','custom');
create type ssl_status               as enum ('none','pending','issued','failed');
create type member_role              as enum ('owner','admin','staff');

create type product_status           as enum ('draft','active','archived');
create type page_status              as enum ('draft','published');
create type landing_page_status      as enum ('draft','published','archived');

create type order_payment_status     as enum ('unpaid','partially_paid','paid','refunded','partially_refunded');
create type order_fulfillment_status as enum ('pending','confirmed','packed','shipped','in_transit','delivered','returned','cancelled');
create type order_source             as enum ('storefront','manual','landing_page','messenger','api');

create type payment_provider         as enum ('bkash','nagad','sslcommerz','cod','manual');
create type payment_status           as enum ('pending','success','failed','cancelled','refunded');

create type courier_provider         as enum ('steadfast','pathao','redx','paperfly','manual');
create type shipment_status          as enum ('created','picked_up','in_transit','delivered','returned','cancelled','hold');
create type cod_status               as enum ('pending','collected','remitted','reconciled','discrepancy');

create type discount_type            as enum ('percentage','fixed_amount','free_shipping');
create type discount_status          as enum ('active','scheduled','expired','disabled');

create type subscription_status      as enum ('trialing','active','past_due','cancelled','expired');
create type invoice_status           as enum ('draft','open','paid','void','overdue');
create type billing_provider         as enum ('bkash','nagad','manual');

-- ============================================================================
-- 3. PLATFORM-LEVEL TABLES (global; not tenant-scoped)
-- ============================================================================

-- 3.1 Subscription plans (catalog)
create table plan (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,                 -- free | starter | growth | pro
  name               text not null,
  price_bdt          numeric(14,2) not null default 0,
  billing_interval   text not null default 'monthly',      -- monthly | yearly
  max_products       integer,                               -- null = unlimited
  max_orders_month   integer,
  max_custom_domains integer not null default 0,
  max_staff          integer not null default 1,
  features           jsonb not null default '{}'::jsonb,
  is_active          boolean not null default true,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 3.2 Users (global identities). In Supabase you may instead reference
-- auth.users(id); here app_user is standalone for portability.
create table app_user (
  id                 uuid primary key default gen_random_uuid(),
  email              citext not null unique,
  full_name          text,
  phone              text,
  avatar_url         text,
  is_platform_admin  boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 3.3 Tenant (a store). tenant.id is the tenant_id everywhere.
create table tenant (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          citext not null unique,                    -- used as *.myhybrid.com subdomain
  status        tenant_status not null default 'trial',
  owner_user_id uuid references app_user(id) on delete set null,
  plan_id       uuid references plan(id) on delete set null,
  trial_ends_at timestamptz,
  default_locale text not null default 'bn',
  currency      text not null default 'BDT',
  timezone      text not null default 'Asia/Dhaka',
  settings      jsonb not null default '{}'::jsonb,        -- store profile, contact, social, VAT/BIN
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  suspended_at  timestamptz
);

-- 3.4 Tenant membership (which user can manage which store)
create table tenant_member (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  user_id     uuid not null references app_user(id) on delete cascade,
  role        member_role not null default 'staff',
  invited_at  timestamptz,
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (tenant_id, user_id)
);

-- 3.5 Domains (subdomain + custom). Custom domains via Vercel for Platforms.
create table tenant_domain (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant(id) on delete cascade,
  domain             citext not null unique,
  type               domain_type not null,
  is_primary         boolean not null default false,
  ssl_status         ssl_status not null default 'none',
  verified           boolean not null default false,
  verification_token text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  verified_at        timestamptz
);
create unique index tenant_domain_one_primary on tenant_domain(tenant_id) where is_primary;

-- 3.6 Theme catalog (global). Section schema is JSON-driven (OS 2.0 style).
create table theme (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name              text not null,
  description       text,
  preview_image_url text,
  category          text,                                  -- fashion | cosmetics | electronics | general | single_product
  default_settings  jsonb not null default '{}'::jsonb,    -- default colors/fonts/layout
  sections_schema   jsonb not null default '{}'::jsonb,    -- available sections + their settings schema
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================================
-- 4. TENANT-SCOPED: STOREFRONT / THEME / CONTENT
-- ============================================================================

-- 4.1 The tenant's active theme + customization JSON
create table tenant_theme_settings (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenant(id) on delete cascade,
  theme_id   uuid not null references theme(id) on delete restrict,
  is_active  boolean not null default true,
  settings   jsonb not null default '{}'::jsonb,           -- tenant's customization
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index tenant_theme_one_active on tenant_theme_settings(tenant_id) where is_active;

-- 4.2 CMS / storefront pages (home sections, about, contact, policies, custom)
create table store_page (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenant(id) on delete cascade,
  type       text not null default 'custom',               -- home | about | contact | policy | custom
  slug       citext not null,
  title      text,
  blocks     jsonb not null default '[]'::jsonb,            -- section/block tree the storefront renders
  seo        jsonb not null default '{}'::jsonb,
  status     page_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

-- 4.3 Navigation menus (main, footer)
create table navigation_menu (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenant(id) on delete cascade,
  handle     text not null,                                 -- main | footer
  items      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, handle)
);

-- 4.4 Landing pages / funnels (CartFlows-style). Same JSON-block model.
create table landing_page (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  slug          citext not null,
  title         text,
  blocks        jsonb not null default '[]'::jsonb,         -- block tree
  funnel_config jsonb not null default '{}'::jsonb,         -- steps, upsells, bumps
  domain_id     uuid references tenant_domain(id) on delete set null,
  status        landing_page_status not null default 'draft',
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, slug)
);

-- ============================================================================
-- 5. TENANT-SCOPED: CATALOG
-- ============================================================================

create table collection (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  title       text not null,
  slug        citext not null,
  description text,
  image_url   text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, slug)
);

create table product (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  title        text not null,
  slug         citext not null,
  description  text,
  status       product_status not null default 'draft',
  vendor       text,
  product_type text,
  tags         text[] not null default '{}',
  options      jsonb not null default '[]'::jsonb,          -- [{name:"Size",values:[...]}, ...]
  seo          jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, slug)
);
create index product_tenant_status_idx on product(tenant_id, status);
create index product_title_trgm_idx on product using gin (title gin_trgm_ops);

create table product_image (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenant(id) on delete cascade,
  product_id uuid not null references product(id) on delete cascade,
  url        text not null,
  alt        text,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index product_image_product_idx on product_image(product_id);

create table product_variant (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant(id) on delete cascade,
  product_id         uuid not null references product(id) on delete cascade,
  title              text,                                  -- e.g. "M / Red"
  sku                text,
  price              numeric(14,2) not null default 0,
  compare_at_price   numeric(14,2),
  cost_price         numeric(14,2),
  options            jsonb not null default '{}'::jsonb,    -- {"Size":"M","Color":"Red"}
  inventory_quantity integer not null default 0,
  track_inventory    boolean not null default true,
  weight_grams       integer,
  barcode            text,
  position           integer not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index product_variant_product_idx on product_variant(product_id);
create unique index product_variant_sku_uniq on product_variant(tenant_id, sku) where sku is not null;

-- Many-to-many product <-> collection
create table product_collection (
  tenant_id     uuid not null references tenant(id) on delete cascade,
  product_id    uuid not null references product(id) on delete cascade,
  collection_id uuid not null references collection(id) on delete cascade,
  position      integer not null default 0,
  primary key (product_id, collection_id)
);
create index product_collection_collection_idx on product_collection(collection_id);

-- ============================================================================
-- 6. TENANT-SCOPED: CUSTOMERS
-- ============================================================================

create table customer (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  name         text,
  phone        text,                                        -- natural key in BD
  email        citext,
  note         text,
  tags         text[] not null default '{}',
  orders_count integer not null default 0,
  total_spent  numeric(14,2) not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index customer_phone_uniq on customer(tenant_id, phone) where phone is not null;

create table customer_address (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenant(id) on delete cascade,
  customer_id    uuid not null references customer(id) on delete cascade,
  recipient_name text,
  phone          text,
  division       text,
  district       text,
  thana          text,                                      -- upazila / thana
  address_line   text,
  is_default     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index customer_address_customer_idx on customer_address(customer_id);

-- ============================================================================
-- 7. TENANT-SCOPED: DISCOUNTS
-- ============================================================================

create table discount (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant(id) on delete cascade,
  code               citext not null,
  title              text,
  type               discount_type not null,
  value              numeric(14,2) not null default 0,
  min_subtotal       numeric(14,2) not null default 0,
  usage_limit        integer,
  used_count         integer not null default 0,
  per_customer_limit integer,
  applies_to         jsonb not null default '{"scope":"all"}'::jsonb,  -- all | collection ids | product ids
  starts_at          timestamptz,
  ends_at            timestamptz,
  status             discount_status not null default 'active',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tenant_id, code)
);

-- ============================================================================
-- 8. TENANT-SCOPED: ORDERS
-- ============================================================================

-- Per-tenant sequential order numbers
create table order_counter (
  tenant_id  uuid primary key references tenant(id) on delete cascade,
  next_value bigint not null default 1
);

create table orders (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant(id) on delete cascade,
  order_number       bigint,                                -- assigned by trigger, unique per tenant
  customer_id        uuid references customer(id) on delete set null,
  customer_name      text,                                  -- snapshot
  customer_phone     text,
  customer_email     citext,
  shipping_address   jsonb not null default '{}'::jsonb,    -- division/district/thana/line/recipient/phone
  billing_address    jsonb not null default '{}'::jsonb,
  subtotal           numeric(14,2) not null default 0,
  discount_total     numeric(14,2) not null default 0,
  shipping_total     numeric(14,2) not null default 0,
  tax_total          numeric(14,2) not null default 0,
  grand_total        numeric(14,2) not null default 0,
  cod_amount         numeric(14,2) not null default 0,      -- to collect on delivery
  currency           text not null default 'BDT',
  payment_status     order_payment_status not null default 'unpaid',
  fulfillment_status order_fulfillment_status not null default 'pending',
  discount_code      text,
  source             order_source not null default 'storefront',
  note               text,
  placed_at          timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  cancelled_at       timestamptz,
  unique (tenant_id, order_number)
);
create index orders_tenant_placed_idx on orders(tenant_id, placed_at desc);
create index orders_tenant_fulfillment_idx on orders(tenant_id, fulfillment_status);
create index orders_customer_idx on orders(customer_id);

create table order_item (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  order_id      uuid not null references orders(id) on delete cascade,
  product_id    uuid references product(id) on delete set null,
  variant_id    uuid references product_variant(id) on delete set null,
  title         text not null,                              -- snapshot
  variant_title text,
  sku           text,
  unit_price    numeric(14,2) not null default 0,
  quantity      integer not null default 1,
  line_total    numeric(14,2) not null default 0,
  created_at    timestamptz not null default now()
);
create index order_item_order_idx on order_item(order_id);

-- Trigger: assign per-tenant sequential order_number atomically
create or replace function assign_order_number() returns trigger
language plpgsql as $$
declare v bigint;
begin
  if new.order_number is not null then
    return new;
  end if;
  insert into order_counter as oc (tenant_id, next_value)
    values (new.tenant_id, 1)
  on conflict (tenant_id) do update set next_value = oc.next_value + 1
  returning oc.next_value into v;
  new.order_number := v;
  return new;
end $$;

create trigger orders_assign_number
  before insert on orders
  for each row execute function assign_order_number();

-- ============================================================================
-- 9. TENANT-SCOPED: PAYMENTS
-- ============================================================================

-- Gateway configuration per tenant (credentials stored encrypted at app layer)
create table payment_account (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  provider    payment_provider not null,
  is_enabled  boolean not null default false,
  credentials jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, provider)
);

create table payment (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenant(id) on delete cascade,
  order_id       uuid not null references orders(id) on delete cascade,
  provider       payment_provider not null,
  status         payment_status not null default 'pending',
  amount         numeric(14,2) not null default 0,
  transaction_id text,
  provider_ref   text,
  payload        jsonb not null default '{}'::jsonb,
  paid_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index payment_order_idx on payment(order_id);
create unique index payment_txn_uniq on payment(tenant_id, provider, transaction_id) where transaction_id is not null;
-- A gateway paymentID (provider_ref) maps to exactly one payment row. The bKash
-- callback resolves the payment by (provider, provider_ref); without this a lost
-- create + retry could write two rows and the callback would silently pick one.
create unique index if not exists payment_provider_ref_uniq
  on payment(provider, provider_ref) where provider_ref is not null;

-- ============================================================================
-- 10. TENANT-SCOPED: COURIER & COD RECONCILIATION  (the differentiator)
-- ============================================================================

create table courier_account (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  provider    courier_provider not null,
  is_enabled  boolean not null default false,
  credentials jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, provider)
);

-- Courier remittance batches (what the courier actually paid the merchant)
create table cod_remittance (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  provider    courier_provider not null,
  reference   text,                                         -- courier remittance/invoice id
  total_amount numeric(14,2) not null default 0,
  remitted_at timestamptz,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index cod_remittance_tenant_provider_idx on cod_remittance(tenant_id, provider);

create table shipment (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant(id) on delete cascade,
  order_id           uuid not null references orders(id) on delete cascade,
  provider           courier_provider not null,
  consignment_id     text,                                  -- courier tracking id
  tracking_code      text,
  status             shipment_status not null default 'created',
  cod_amount         numeric(14,2) not null default 0,      -- expected COD
  cod_collected      numeric(14,2),                         -- courier reports collected
  cod_remitted       numeric(14,2),                         -- amount actually paid out
  cod_status         cod_status not null default 'pending',
  reconciled         boolean not null default false,
  discrepancy_amount numeric(14,2) not null default 0,      -- set by reconciliation engine
  remittance_id      uuid references cod_remittance(id) on delete set null,
  raw_status         text,
  payload            jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  delivered_at       timestamptz
);
create index shipment_order_idx on shipment(order_id);
create index shipment_tenant_codstatus_idx on shipment(tenant_id, cod_status);
create unique index shipment_consignment_uniq
  on shipment(tenant_id, provider, consignment_id) where consignment_id is not null;

-- ============================================================================
-- 11. TENANT-SCOPED: BILLING (the SaaS subscription itself)
-- ============================================================================

create table subscription (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenant(id) on delete cascade,
  plan_id              uuid not null references plan(id) on delete restrict,
  status               subscription_status not null default 'trialing',
  current_period_start timestamptz,
  current_period_end   timestamptz,
  billing_provider     billing_provider,
  provider_ref         text,
  cancel_at_period_end boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index subscription_one_active
  on subscription(tenant_id) where status in ('trialing','active','past_due');

create table invoice (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  subscription_id uuid references subscription(id) on delete set null,
  invoice_number  text,
  amount          numeric(14,2) not null default 0,
  status          invoice_status not null default 'open',
  due_at          timestamptz,
  paid_at         timestamptz,
  provider        billing_provider,
  provider_ref    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index invoice_tenant_status_idx on invoice(tenant_id, status);

-- Per-tenant monthly usage (for plan-limit enforcement)
create table usage_counter (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  period_month date not null,                               -- first day of month
  orders_count integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, period_month)
);

-- ============================================================================
-- 12. TENANT-SCOPED: EVENTS / AUDIT / WEBHOOKS
-- ============================================================================

-- High-volume analytics events
create table analytics_event (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references tenant(id) on delete cascade,
  type        text not null,
  session_id  text,
  customer_id uuid references customer(id) on delete set null,
  payload     jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index analytics_event_tenant_type_time_idx on analytics_event(tenant_id, type, occurred_at desc);

-- Admin action audit trail (tenant_id nullable for platform-level actions).
-- Canonical schema matches migration 17_audit_log.sql + the app contract in
-- lib/audit/record.ts (audit_action enum, resource_type/resource_id/details,
-- occurred_at). 02_policies adds the tenant-isolation policy; 17 re-applies this
-- block idempotently.
create type audit_action as enum (
  'settings.update','product.create','product.update','product.delete',
  'order.refund','order.cancel','member.invite','member.remove',
  'member.role_change','payment_account.update',
  'tenant.suspend','tenant.reactivate','tenant.plan_change','platform_admin.login'
);
create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenant(id) on delete cascade,
  actor_user_id uuid references app_user(id) on delete set null,
  action        audit_action not null,
  resource_type text,
  resource_id   text,
  details       jsonb not null default '{}'::jsonb,
  ip_address    inet,
  user_agent    text,
  occurred_at   timestamptz not null default now()
);
create index audit_log_tenant_time_idx on audit_log(tenant_id, occurred_at desc);
create index audit_log_actor_time_idx on audit_log(actor_user_id, occurred_at desc);
create index audit_log_action_idx on audit_log(action, occurred_at desc);

-- Inbound webhook idempotency (payments / couriers). tenant_id nullable.
create table webhook_event (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references tenant(id) on delete cascade,
  provider     text not null,
  event_type   text,
  external_id  text,
  payload      jsonb not null default '{}'::jsonb,
  processed    boolean not null default false,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, external_id)
);

-- ============================================================================
-- 13. updated_at triggers
-- ============================================================================
do $$
declare t text;
  touch_tables text[] := array[
    'plan','app_user','tenant','tenant_domain','theme',
    'tenant_theme_settings','store_page','navigation_menu','landing_page',
    'collection','product','product_variant','customer','customer_address',
    'discount','orders','payment_account','payment','courier_account',
    'shipment','subscription','invoice','usage_counter'
  ];
begin
  foreach t in array touch_tables loop
    execute format(
      'create trigger %1$I_set_updated_at before update on %1$I
       for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ============================================================================
-- End of File 1. Now run 02_policies.sql to enable Row-Level Security.
-- ============================================================================
