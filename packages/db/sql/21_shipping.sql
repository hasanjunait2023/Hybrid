-- Migration 21 — Shipping rate calculator (M3 add).
--
-- Per-tenant, zone-based shipping rates computed at checkout from the
-- destination (Division→District→Thana already on the order address) + parcel
-- weight (sum of variant weight_grams). Three zones keyed off the tenant's
-- origin district:
--   same_district   — destination district == origin district
--   same_division   — same division, different district
--   other_division  — different division
-- Rate = base + per_kg * ceil(weight_kg); zeroed when subtotal >= free_above.
-- Volumetric weight (needs L×W×H product dims, not yet captured) is a follow-up;
-- `volumetric_divisor` is stored now so the calc can switch to max(actual,
-- volumetric) once dimensions land. Idempotent (re-applies as a no-op).

-- 21.1 per-tenant shipping config (origin + global knobs). One row per tenant.
create table if not exists shipping_config (
  tenant_id          uuid primary key references tenant(id) on delete cascade,
  origin_division    text,
  origin_district    text,
  -- divisor for volumetric weight (cm^3 / divisor = kg). 5000 = air, 6000 = road.
  volumetric_divisor integer not null default 5000,
  -- free shipping when order subtotal (pre-shipping) >= this (null = never).
  free_above         numeric(14,2),
  -- used when no zone rate row matches (safety net).
  default_rate       numeric(14,2) not null default 60,
  enabled            boolean not null default false,
  updated_at         timestamptz not null default now()
);

-- 21.2 per-zone rate rows. (tenant, zone) unique.
create table if not exists shipping_zone_rate (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  zone        text not null,                      -- same_district | same_division | other_division
  base        numeric(14,2) not null default 0,   -- flat per-parcel
  per_kg      numeric(14,2) not null default 0,   -- added per kg (ceil)
  updated_at  timestamptz not null default now(),
  unique (tenant_id, zone)
);

create index if not exists shipping_zone_rate_tenant_idx on shipping_zone_rate(tenant_id);

-- 21.3 RLS — tenant isolation (config is tenant-scoped; reads/writes via withTenant).
alter table shipping_config enable row level security;
alter table shipping_config force row level security;
drop policy if exists shipping_config_isolation on shipping_config;
create policy shipping_config_isolation on shipping_config
  using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
  with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());

alter table shipping_zone_rate enable row level security;
alter table shipping_zone_rate force row level security;
drop policy if exists shipping_zone_rate_isolation on shipping_zone_rate;
create policy shipping_zone_rate_isolation on shipping_zone_rate
  using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
  with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());

grant select, insert, update, delete on shipping_config to app_runtime;
grant select, insert, update, delete on shipping_zone_rate to app_runtime;
