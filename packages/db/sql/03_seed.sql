-- ============================================================================
-- Hybrid — 03_seed.sql  (runs AFTER 02_policies.sql, as superuser -> RLS bypassed)
-- ----------------------------------------------------------------------------
-- Deterministic fixtures for local dev and the RLS isolation suite.
-- Fixed UUIDs are load-bearing: the Vitest RLS tests reference them directly.
--
-- Tenants:
--   A = aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a  slug store-a  accent INDIGO  #1D4ED8
--   B = bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b  slug store-b  accent CRIMSON #DC2626 (visibly distinct)
-- Users:
--   owner-a = 11111111-1111-1111-1111-111111111001
--   owner-b = 11111111-1111-1111-1111-111111111002
--   admin   = 11111111-1111-1111-1111-1111111110ff  (is_platform_admin)
-- Theme:  00000000-0000-0000-0000-0000000000aa  code 'aurora'
--
-- order_counter is intentionally NOT pre-seeded so the RLS suite exercises the
-- assign_order_number() trigger's INSERT ... ON CONFLICT path under RLS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------
insert into plan (code, name, price_bdt, billing_interval, max_products, max_orders_month, max_custom_domains, max_staff, sort_order)
values
  ('free',    'Free',       0,    'monthly', 50,   100,  0, 1, 0),
  ('starter', 'Starter',    799,  'monthly', 500,  1000, 1, 3, 1),
  ('growth',  'Growth',     2499, 'monthly', 5000, 10000,3, 8, 2),
  ('pro',     'Pro',        4999, 'monthly', null, null, 10,25,3)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Theme (storefront design is "Doreja" per DESIGN.md; row code stays 'aurora')
-- ---------------------------------------------------------------------------
insert into theme (id, code, name, description, category, default_settings, is_active, sort_order)
values (
  '00000000-0000-0000-0000-0000000000aa',
  'aurora',
  'Aurora',
  'Default Hybrid storefront theme (Phase 0).',
  'general',
  '{"colors":{"primary":"#1D4ED8","accent":"#F59E0B","bg":"#FBFAF8"},"font":"Hind Siliguri"}'::jsonb,
  true,
  0
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
insert into app_user (id, email, full_name, is_platform_admin)
values
  ('11111111-1111-1111-1111-111111111001', 'owner-a@hybrid.local', 'Owner A',       false),
  ('11111111-1111-1111-1111-111111111002', 'owner-b@hybrid.local', 'Owner B',       false),
  ('11111111-1111-1111-1111-1111111110ff', 'admin@hybrid.local',   'Platform Admin', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------
insert into tenant (id, name, slug, status, owner_user_id, plan_id, default_locale, currency, timezone)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a',
    'Store A', 'store-a', 'active',
    '11111111-1111-1111-1111-111111111001',
    (select id from plan where code = 'starter'),
    'bn', 'BDT', 'Asia/Dhaka'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b',
    'Store B', 'store-b', 'active',
    '11111111-1111-1111-1111-111111111002',
    (select id from plan where code = 'starter'),
    'bn', 'BDT', 'Asia/Dhaka'
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Memberships (owners)
-- ---------------------------------------------------------------------------
insert into tenant_member (tenant_id, user_id, role, accepted_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a', '11111111-1111-1111-1111-111111111001', 'owner', now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b', '11111111-1111-1111-1111-111111111002', 'owner', now())
on conflict (tenant_id, user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Domains (subdomain, verified primary)
-- ---------------------------------------------------------------------------
insert into tenant_domain (tenant_id, domain, type, is_primary, ssl_status, verified, verified_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a', 'store-a.lvh.me', 'subdomain', true, 'issued', true, now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b', 'store-b.lvh.me', 'subdomain', true, 'issued', true, now())
on conflict (domain) do nothing;

-- ---------------------------------------------------------------------------
-- Active theme settings per tenant — VISIBLY distinct accent colors
-- ---------------------------------------------------------------------------
insert into tenant_theme_settings (tenant_id, theme_id, is_active, settings)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a',
    '00000000-0000-0000-0000-0000000000aa', true,
    '{"colors":{"primary":"#1D4ED8","accent":"#1D4ED8"},"storeName":"Store A"}'::jsonb
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b',
    '00000000-0000-0000-0000-0000000000aa', true,
    '{"colors":{"primary":"#DC2626","accent":"#DC2626"},"storeName":"Store B"}'::jsonb
  )
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Home page (published) per tenant
-- ---------------------------------------------------------------------------
insert into store_page (tenant_id, type, slug, title, status, blocks)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a', 'home', 'home', 'Store A — Home', 'published',
    '[{"type":"hero","heading":"Welcome to Store A"},{"type":"featured_products"}]'::jsonb
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b', 'home', 'home', 'Store B — Home', 'published',
    '[{"type":"hero","heading":"Welcome to Store B"},{"type":"featured_products"}]'::jsonb
  )
on conflict (tenant_id, slug) do nothing;

-- ---------------------------------------------------------------------------
-- Products (3 active per tenant) + 1 variant each (position 0, price)
-- ---------------------------------------------------------------------------
-- Store A products
insert into product (id, tenant_id, title, slug, status, description)
values
  ('a0000001-0000-0000-0000-0000000000a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a', 'A — Cotton Tee',     'a-cotton-tee',     'active', 'Soft cotton tee.'),
  ('a0000002-0000-0000-0000-0000000000a2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a', 'A — Denim Jacket',   'a-denim-jacket',   'active', 'Classic denim jacket.'),
  ('a0000003-0000-0000-0000-0000000000a3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a', 'A — Canvas Sneaker', 'a-canvas-sneaker', 'active', 'Everyday sneaker.')
on conflict (id) do nothing;

insert into product_variant (tenant_id, product_id, title, price, position, inventory_quantity)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a', 'a0000001-0000-0000-0000-0000000000a1', 'Default', 499.00,  0, 100),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a', 'a0000002-0000-0000-0000-0000000000a2', 'Default', 1899.00, 0, 40),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a', 'a0000003-0000-0000-0000-0000000000a3', 'Default', 1299.00, 0, 60)
on conflict do nothing;

-- Store B products
insert into product (id, tenant_id, title, slug, status, description)
values
  ('b0000001-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b', 'B — Silk Scarf',   'b-silk-scarf',   'active', 'Hand-finished silk scarf.'),
  ('b0000002-0000-0000-0000-0000000000b2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b', 'B — Leather Bag',  'b-leather-bag',  'active', 'Full-grain leather bag.'),
  ('b0000003-0000-0000-0000-0000000000b3', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b', 'B — Wool Beanie',  'b-wool-beanie',  'active', 'Warm wool beanie.')
on conflict (id) do nothing;

insert into product_variant (tenant_id, product_id, title, price, position, inventory_quantity)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b', 'b0000001-0000-0000-0000-0000000000b1', 'Default', 899.00,  0, 80),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b', 'b0000002-0000-0000-0000-0000000000b2', 'Default', 4599.00, 0, 25),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b', 'b0000003-0000-0000-0000-0000000000b3', 'Default', 650.00,  0, 120)
on conflict do nothing;
