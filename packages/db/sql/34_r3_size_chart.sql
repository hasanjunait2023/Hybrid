-- ============================================================================
-- 34_r3_size_chart.sql — Per-category size charts on the PDP (Sprint-1 R3).
--
-- Merchant defines ONE size chart per (tenant_id, category) — e.g. "men's
-- shirts", "women's dresses", "footwear", "kids' tops". The storefront binds
-- the active product's category to its chart and renders a "Size Guide"
-- button next to the size selector. Categories are free text (matches the
-- existing `product.category` taxonomy in 01_schema.sql — fashion | cosmetics |
-- electronics | general | single_product). We constrain them at the write path
-- via the Zod SizeChartCategory enum, but the storage layer accepts any
-- non-empty lowercased slug the merchant wants.
--
-- Same isolation contract as every other tenant-scoped table: RLS enabled +
-- FORCED, policy keyed on app.current_tenant_id(). The unique constraint on
-- (tenant_id, category) makes it safe to upsert from the admin form without
-- a separate existence check.
--
-- Row shape (JSONB `chart_data`):
--   {
--     "columns": ["size","chest","length","shoulder","sleeve","waist","hip","insole"],
--     "rows": [
--       { "size": "M",  "chest": 38, "length": 27, "shoulder": 17, "sleeve": 23 },
--       { "size": "L",  "chest": 40, "length": 28, "shoulder": 18, "sleeve": 24 }
--     ]
--   }
-- The "size" column is always present. Other columns are category-specific
-- (clothing: chest/length/shoulder/sleeve; bottoms: waist/hip/inseam;
-- footwear: insole/cm-or-inches; accessories: free). Numeric measurements
-- are stored in the unit specified by `unit` (inch | cm) — no auto
-- conversion at the storage layer (the modal renders the unit as-is and
-- the merchant can publish the same chart in both units by editing it).
-- ============================================================================

create table if not exists size_chart (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  category    text not null,
  -- inch | cm — affects every numeric measurement inside chart_data.rows
  unit        text not null default 'inch'
                check (unit in ('inch', 'cm')),
  chart_data  jsonb not null
                check (jsonb_typeof(chart_data) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- One chart per (tenant, category). The admin edit-form relies on
  -- ON CONFLICT to upsert without a separate existence check.
  unique (tenant_id, category)
);

create index if not exists size_chart_tenant_idx
  on size_chart (tenant_id, category);

-- Updated_at touch trigger — same shape as 02_policies.sql §5.
do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'size_chart'
  ) then
    if not exists (
      select 1 from pg_trigger where tgname = 'size_chart_updated_at_trg'
    ) then
      create trigger size_chart_updated_at_trg
        before update on size_chart
        for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- ---- RLS: identical isolation contract as 02_policies.sql §2 ----------------
do $$
declare t text := 'size_chart';
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = t
  ) then
    return;
  end if;
  execute format('alter table %I enable row level security;', t);
  execute format('alter table %I force row level security;', t);
  if not exists (
    select 1 from pg_policies where tablename = t and policyname = t || '_isolation'
  ) then
    execute format($f$
      create policy %1$I_isolation on %1$I
        using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
        with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
    $f$, t);
  end if;
  grant select, insert, update, delete on size_chart to app_runtime;
end $$;

-- ---- Defence-in-depth (mirrors 33_r1_video.sql) -----------------------------
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'size_chart' and policyname = 'size_chart_isolation'
  ) then
    alter table size_chart enable row level security;
    alter table size_chart force row level security;
    create policy size_chart_isolation on size_chart
      using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
      with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
  end if;
  grant select, insert, update, delete on size_chart to app_runtime;
end $$;
