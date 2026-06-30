-- ============================================================================
-- 38_o9_order_tags.sql — O9 order tags (VIP / gift / fragile)
-- Additive, idempotent; runs after 37.
--
-- What this adds:
--   * orders.tags text[] — array of short string tags the merchant
--     can attach to an order ("VIP", "gift", "fragile", "birthday",
--     etc.). Free-form within a CHECK'd vocabulary + a small set of
--     built-ins.
--   * tenant.order_tag_vocabulary text[] — the per-tenant allowed
--     vocabulary. Default contains the 3 built-ins; merchants can
--     extend via /admin/settings.
--
-- Why text[] not a separate order_tag table:
--   * Tags are a flat string list, never queried relationally.
--   * The vocabulary is small (<20 tags per merchant).
--   * Partial index on the 3 built-in tags keeps the "show me all
--     VIP orders" admin filter O(vip_orders) instead of O(all_orders).
-- ============================================================================

alter table orders
  add column if not exists tags text[] not null default '{}'::text[];

alter table tenant
  add column if not exists order_tag_vocabulary text[] not null default array['VIP', 'gift', 'fragile']::text[];

-- CHECK that the array doesn't blow up.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_tags_len_check'
  ) then
    alter table orders
      add constraint orders_tags_len_check
      check (array_length(tags, 1) <= 20);
  end if;
end $$;

-- The 3 built-in tags get their own partial indexes so the admin
-- "show me all VIP / gift / fragile orders" filter is fast.
create index if not exists orders_tags_vip_idx
  on orders (tenant_id, created_at desc)
  where 'VIP' = any(tags);

create index if not exists orders_tags_gift_idx
  on orders (tenant_id, created_at desc)
  where 'gift' = any(tags);

create index if not exists orders_tags_fragile_idx
  on orders (tenant_id, created_at desc)
  where 'fragile' = any(tags);

-- Down migration
-- (see packages/db/sql/down/38_o9_order_tags.down.sql)
