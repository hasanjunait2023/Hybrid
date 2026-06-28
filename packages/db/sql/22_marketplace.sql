-- ============================================================================
-- 22_marketplace.sql — Multi-vendor MARKETPLACE ("Bazar") base layer. Additive.
--
-- A second, integrated commerce surface that aggregates every tenant's ACTIVE
-- products into one cross-vendor storefront (Daraz/Amazon style), while each
-- tenant's own storefront stays untouched. The marketplace is a PLATFORM-LEVEL
-- PROJECTION: it never owns inventory or fulfillment — it reads from a
-- denormalized projection of tenant catalogs and FANS WRITES into the existing
-- per-vendor withTenant() order transactions.
--
-- Isolation model (three contexts):
--   * Catalog projection tables (category/listing/listing_variant) are
--     WORLD-READABLE (USING (true), like plan/theme) so public browse runs as
--     the normal non-superuser role with RLS ON — never via asPlatformAdmin.
--     Writes (the sync) are the legitimate platform-tooling use of asPlatformAdmin.
--   * Buyer-owned tables (customer/session/order/suborder/review/commission) are
--     scoped by a NEW GUC app.current_buyer_id() + the withBuyer() helper, so a
--     buyer sees only their own rows. RLS stays sacred — no asPlatformAdmin for
--     normal buyer reads.
--   * COD-first: a split cart becomes one COD sub-order PER VENDOR (a normal
--     tenant `orders` row, channel='marketplace'), each fulfilled through the
--     vendor's existing admin + courier + COD reconciliation. No escrow/payout.
--
-- Idempotent; runs once after 21. Matches the contract of 02_policies.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Buyer GUC helper (mirror app.current_tenant_id / app.current_user_id)
-- ---------------------------------------------------------------------------
create or replace function app.current_buyer_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.current_buyer_id', true), '')::uuid
$$;
grant execute on function app.current_buyer_id() to app_runtime;

-- ---------------------------------------------------------------------------
-- 1. Additive columns on existing tenant tables
-- ---------------------------------------------------------------------------
-- channel distinguishes a marketplace sub-order from a normal storefront order
-- WITHOUT touching the order_source enum (keeps existing source-keyed reports
-- intact). marketplace_order_id is a VALUE link to the platform parent — never
-- a hard FK across the RLS boundary.
alter table orders add column if not exists channel text not null default 'storefront';
alter table orders add column if not exists marketplace_order_id uuid;
create index if not exists orders_marketplace_idx
  on orders (tenant_id, marketplace_order_id)
  where marketplace_order_id is not null;

-- Per-product "hide from marketplace" toggle. Default false = auto-listed.
alter table product add column if not exists marketplace_hidden boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Platform singleton config (commission rate, record-only)
-- ---------------------------------------------------------------------------
create table if not exists marketplace_config (
  id              boolean primary key default true check (id),     -- singleton guard
  commission_rate numeric(5,4) not null default 0.0500,            -- 5%, record-only
  updated_at      timestamptz not null default now()
);
insert into marketplace_config (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Curated flat taxonomy (world-readable)
-- ---------------------------------------------------------------------------
create table if not exists marketplace_category (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name_bn     text not null,
  name_en     text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Flat reference taxonomy (Bengali-first). Lives in the migration (not 03_seed)
-- so it exists regardless of seed-vs-migrate ordering. Idempotent.
insert into marketplace_category (slug, name_bn, name_en, sort_order) values
  ('electronics', 'ইলেকট্রনিক্স',  'Electronics',   10),
  ('fashion',     'ফ্যাশন',        'Fashion',       20),
  ('beauty',      'রূপচর্চা',      'Beauty',        30),
  ('home-living', 'ঘর ও জীবনযাপন', 'Home & Living', 40),
  ('grocery',     'মুদি',          'Grocery',       50),
  ('mobile',      'মোবাইল',        'Mobile',        60),
  ('books',       'বই',            'Books',         70),
  ('toys',        'খেলনা',         'Toys',          80),
  ('health',      'স্বাস্থ্য',     'Health',        90),
  ('sports',      'খেলাধুলা',      'Sports',       100),
  ('automotive',  'অটোমোটিভ',      'Automotive',   110),
  ('others',      'অন্যান্য',      'Others',       120)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Catalog projection — one row per listed PRODUCT (world-readable)
--    Kept in sync from product/product_variant by the listing-sync writer.
--    in_stock / price_from are ADVISORY (browse badges) — never authoritative.
-- ---------------------------------------------------------------------------
create table if not exists marketplace_listing (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references product(id) on delete cascade,
  tenant_id     uuid not null references tenant(id) on delete cascade,   -- denormalized vendor
  vendor_slug   text not null,                                           -- snapshot for links/badges
  vendor_name   text not null,                                           -- snapshot
  category_id   uuid references marketplace_category(id) on delete set null,
  title         text not null,
  slug          text not null,                                           -- product slug (vendor-scoped)
  description   text,
  price_from    numeric(14,2) not null default 0,                        -- min active variant price
  image_url     text,
  in_stock      boolean not null default true,                           -- advisory snapshot
  rating_avg    numeric(3,2) not null default 0,
  rating_count  integer not null default 0,
  status        text not null default 'active',                          -- 'active' = listed | 'delisted'
  hidden        boolean not null default false,                          -- mirrors product.marketplace_hidden
  search_tsv    tsvector generated always as (
                  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                  setweight(to_tsvector('simple', coalesce(vendor_name, '')), 'B') ||
                  setweight(to_tsvector('simple', coalesce(description, '')), 'C')
                ) stored,
  synced_at     timestamptz not null default now(),
  unique (product_id)
);
create index if not exists ml_visible_idx
  on marketplace_listing (status, hidden) where status = 'active' and hidden = false;
create index if not exists ml_category_idx
  on marketplace_listing (category_id) where status = 'active' and hidden = false;
create index if not exists ml_tenant_idx on marketplace_listing (tenant_id);
create index if not exists ml_search_idx on marketplace_listing using gin (search_tsv);

-- Thin variant projection so the PDP never needs asPlatformAdmin.
create table if not exists marketplace_listing_variant (
  id          uuid primary key,                  -- = product_variant.id (mirror)
  listing_id  uuid not null references marketplace_listing(id) on delete cascade,
  product_id  uuid not null,
  tenant_id   uuid not null,
  title       text,
  options     jsonb not null default '{}'::jsonb,
  price       numeric(14,2) not null default 0,
  in_stock    boolean not null default true,     -- advisory
  position    integer not null default 0
);
create index if not exists mlv_listing_idx on marketplace_listing_variant (listing_id);

-- ---------------------------------------------------------------------------
-- 5. Unified buyer identity + opaque session (buyer-owned)
-- ---------------------------------------------------------------------------
create table if not exists marketplace_customer (
  id            uuid primary key default gen_random_uuid(),
  phone         text not null unique,              -- natural key (BD phone)
  name          text,
  email         citext,
  password_hash text,                              -- optional; OTP is primary
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Mirrors user_session: opaque token, store only its SHA-256. Lookups
-- (cookie -> buyer_id) run via asPlatformAdmin, same precedent as getPasswordSession.
create table if not exists marketplace_session (
  id          uuid primary key default gen_random_uuid(),
  buyer_id    uuid not null references marketplace_customer(id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists ms_buyer_idx on marketplace_session (buyer_id);

-- ---------------------------------------------------------------------------
-- 6. Parent order (saga) + buyer-visible per-vendor snapshot (buyer-owned)
-- ---------------------------------------------------------------------------
create table if not exists marketplace_order (
  id              uuid primary key default gen_random_uuid(),
  buyer_id        uuid not null references marketplace_customer(id) on delete restrict,
  status          text not null default 'pending',   -- pending|confirmed|partial|failed
  idempotency_key text,                               -- dedupe double-submit
  vendor_count    integer not null default 0,
  items_total     numeric(14,2) not null default 0,
  shipping_total  numeric(14,2) not null default 0,
  grand_total     numeric(14,2) not null default 0,
  contact_name    text not null,
  contact_phone   text not null,
  ship_division   text not null,
  ship_district   text not null,
  ship_thana      text not null,
  ship_line       text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists mo_buyer_idx on marketplace_order (buyer_id, created_at desc);
create unique index if not exists mo_idempotency_idx
  on marketplace_order (idempotency_key) where idempotency_key is not null;

-- Buyer-visible projection of each vendor sub-order. order_id is a VALUE link
-- into tenant `orders` (NO hard FK across the RLS boundary). The fulfillment
-- status is synced back here by the admin hook + reconcile cron so buyer order
-- history never has to read tenant `orders`.
create table if not exists marketplace_suborder (
  id                   uuid primary key default gen_random_uuid(),
  marketplace_order_id uuid not null references marketplace_order(id) on delete cascade,
  buyer_id             uuid not null,                 -- denormalized for RLS
  tenant_id            uuid not null references tenant(id) on delete cascade,
  vendor_name          text not null,                 -- snapshot
  order_id             uuid,                          -- value-link into tenant orders
  order_number         bigint,
  status               text not null default 'confirmed',   -- snapshot of fulfillment_status
  payment_status       text not null default 'unpaid',
  items_subtotal       numeric(14,2) not null default 0,
  shipping_total       numeric(14,2) not null default 0,
  grand_total          numeric(14,2) not null default 0,
  cod_amount           numeric(14,2) not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists mso_parent_idx on marketplace_suborder (marketplace_order_id);
create index if not exists mso_buyer_idx on marketplace_suborder (buyer_id);
create index if not exists mso_tenant_order_idx on marketplace_suborder (tenant_id, order_id);

-- ---------------------------------------------------------------------------
-- 7. Ratings & reviews (buyer write, vendor moderation, public approved read)
-- ---------------------------------------------------------------------------
create table if not exists marketplace_review (
  id                uuid primary key default gen_random_uuid(),
  buyer_id          uuid not null references marketplace_customer(id) on delete cascade,
  product_id        uuid not null references product(id) on delete cascade,
  tenant_id         uuid not null references tenant(id) on delete cascade,   -- vendor who moderates
  rating            integer not null check (rating between 1 and 5),
  body              text,
  verified_purchase boolean not null default false,
  status            text not null default 'pending',     -- pending|approved|rejected
  created_at        timestamptz not null default now(),
  moderated_at      timestamptz,
  unique (buyer_id, product_id)
);
create index if not exists mr_product_status_idx on marketplace_review (product_id, status);
create index if not exists mr_tenant_status_idx on marketplace_review (tenant_id, status);

-- ---------------------------------------------------------------------------
-- 8. Commission ledger (record-only; no payout)
-- ---------------------------------------------------------------------------
create table if not exists marketplace_commission (
  id                   uuid primary key default gen_random_uuid(),
  marketplace_order_id uuid references marketplace_order(id) on delete set null,
  suborder_id          uuid references marketplace_suborder(id) on delete set null,
  tenant_id            uuid not null references tenant(id) on delete cascade,
  gross                numeric(14,2) not null,
  rate                 numeric(5,4) not null,
  commission_amount    numeric(14,2) not null,
  created_at           timestamptz not null default now()
);
create index if not exists mc_tenant_idx on marketplace_commission (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 9. Grants (explicit, matching 12_reviews.sql style)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on marketplace_config to app_runtime;
grant select, insert, update, delete on marketplace_category to app_runtime;
grant select, insert, update, delete on marketplace_listing to app_runtime;
grant select, insert, update, delete on marketplace_listing_variant to app_runtime;
grant select, insert, update, delete on marketplace_customer to app_runtime;
grant select, insert, update, delete on marketplace_session to app_runtime;
grant select, insert, update, delete on marketplace_order to app_runtime;
grant select, insert, update, delete on marketplace_suborder to app_runtime;
grant select, insert, update, delete on marketplace_review to app_runtime;
grant select, insert, update, delete on marketplace_commission to app_runtime;

-- ---------------------------------------------------------------------------
-- 10. RLS + policies
-- ---------------------------------------------------------------------------
do $$
begin
  -- World-readable catalog projection (public browse; platform-admin writes).
  -- config is admin-only (read+write).
  execute 'alter table marketplace_config enable row level security';
  execute 'alter table marketplace_config force row level security';
  if not exists (select 1 from pg_policies where tablename='marketplace_config' and policyname='mcfg_read') then
    create policy mcfg_read   on marketplace_config for select using (app.is_platform_admin());
    create policy mcfg_write  on marketplace_config for all
      using (app.is_platform_admin()) with check (app.is_platform_admin());
  end if;

  execute 'alter table marketplace_category enable row level security';
  execute 'alter table marketplace_category force row level security';
  if not exists (select 1 from pg_policies where tablename='marketplace_category' and policyname='mcat_read') then
    create policy mcat_read   on marketplace_category for select using (true);
    create policy mcat_write  on marketplace_category for all
      using (app.is_platform_admin()) with check (app.is_platform_admin());
  end if;

  execute 'alter table marketplace_listing enable row level security';
  execute 'alter table marketplace_listing force row level security';
  if not exists (select 1 from pg_policies where tablename='marketplace_listing' and policyname='ml_read') then
    create policy ml_read  on marketplace_listing for select using (true);
    create policy ml_write on marketplace_listing for all
      using (app.is_platform_admin()) with check (app.is_platform_admin());
  end if;

  execute 'alter table marketplace_listing_variant enable row level security';
  execute 'alter table marketplace_listing_variant force row level security';
  if not exists (select 1 from pg_policies where tablename='marketplace_listing_variant' and policyname='mlv_read') then
    create policy mlv_read  on marketplace_listing_variant for select using (true);
    create policy mlv_write on marketplace_listing_variant for all
      using (app.is_platform_admin()) with check (app.is_platform_admin());
  end if;

  -- Buyer-owned: customer (self or admin; admin can insert at signup + read at login lookup).
  execute 'alter table marketplace_customer enable row level security';
  execute 'alter table marketplace_customer force row level security';
  if not exists (select 1 from pg_policies where tablename='marketplace_customer' and policyname='mcust_select') then
    create policy mcust_select on marketplace_customer for select
      using (id = app.current_buyer_id() or app.is_platform_admin());
    create policy mcust_insert on marketplace_customer for insert
      with check (app.is_platform_admin() or id = app.current_buyer_id());
    create policy mcust_update on marketplace_customer for update
      using (id = app.current_buyer_id() or app.is_platform_admin())
      with check (id = app.current_buyer_id() or app.is_platform_admin());
    create policy mcust_delete on marketplace_customer for delete using (app.is_platform_admin());
  end if;

  -- Sessions: platform-tooling only (mint/lookup/revoke run via asPlatformAdmin).
  execute 'alter table marketplace_session enable row level security';
  execute 'alter table marketplace_session force row level security';
  if not exists (select 1 from pg_policies where tablename='marketplace_session' and policyname='msess_admin') then
    create policy msess_admin on marketplace_session for all
      using (app.is_platform_admin()) with check (app.is_platform_admin());
  end if;

  -- Parent order: buyer owns; platform admin (cron saga-recovery) may read/write.
  execute 'alter table marketplace_order enable row level security';
  execute 'alter table marketplace_order force row level security';
  if not exists (select 1 from pg_policies where tablename='marketplace_order' and policyname='mo_all') then
    create policy mo_all on marketplace_order for all
      using (buyer_id = app.current_buyer_id() or app.is_platform_admin())
      with check (buyer_id = app.current_buyer_id() or app.is_platform_admin());
  end if;

  -- Sub-order snapshot: buyer reads own; writes are platform-tooling (orchestrator/cron).
  execute 'alter table marketplace_suborder enable row level security';
  execute 'alter table marketplace_suborder force row level security';
  if not exists (select 1 from pg_policies where tablename='marketplace_suborder' and policyname='mso_select') then
    create policy mso_select on marketplace_suborder for select
      using (buyer_id = app.current_buyer_id() or app.is_platform_admin());
    create policy mso_write on marketplace_suborder for all
      using (app.is_platform_admin()) with check (app.is_platform_admin());
  end if;

  -- Reviews: three audiences ORed via separate permissive SELECT policies.
  execute 'alter table marketplace_review enable row level security';
  execute 'alter table marketplace_review force row level security';
  if not exists (select 1 from pg_policies where tablename='marketplace_review' and policyname='mr_select_buyer') then
    create policy mr_select_buyer  on marketplace_review for select using (buyer_id = app.current_buyer_id());
    create policy mr_select_vendor on marketplace_review for select
      using (tenant_id = app.current_tenant_id() or app.is_platform_admin());
    create policy mr_select_public on marketplace_review for select using (status = 'approved');
    create policy mr_insert on marketplace_review for insert with check (buyer_id = app.current_buyer_id());
    create policy mr_update on marketplace_review for update
      using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
      with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
    create policy mr_delete on marketplace_review for delete
      using (buyer_id = app.current_buyer_id() or app.is_platform_admin());
  end if;

  -- Commission: vendor reads own; platform admin all; writes platform-tooling.
  execute 'alter table marketplace_commission enable row level security';
  execute 'alter table marketplace_commission force row level security';
  if not exists (select 1 from pg_policies where tablename='marketplace_commission' and policyname='mc_select') then
    create policy mc_select on marketplace_commission for select
      using (tenant_id = app.current_tenant_id() or app.is_platform_admin());
    create policy mc_write on marketplace_commission for all
      using (app.is_platform_admin()) with check (app.is_platform_admin());
  end if;
end $$;
