-- ============================================================================
-- 37_r7_stock_alert.sql — R7 per-variant low-stock alert
-- Additive, idempotent; runs after 36.
--
-- What this adds:
--   * product_variant.low_stock_threshold — per-variant override (NULL =
--     fall back to the tenant default). When inventory_quantity drops
--     to or below this threshold, the variant is "low" and the sweep
--     fires an admin SMS.
--   * product_variant.last_low_stock_alert_at — the last time the
--     sweep fired an SMS for THIS variant. Used to dedup so a single
--     low-stock state doesn't generate 30 SMS/day.
--   * tenant.stock_alert_enabled — kill switch (off by default per the
--     "don't spam merchants" doctrine; merchants opt in).
--   * tenant.stock_alert_default_threshold — fallback when a variant
--     has no per-variant override. Default 5 (any variant with ≤5 in
--     stock is "low").
--   * tenant.stock_alert_recipients — array of phone numbers to SMS
--     (multiple store managers can be in the loop). Empty array =
--     fall back to the owner_user_id's phone.
-- ============================================================================

alter table product_variant
  add column if not exists low_stock_threshold       integer,
  add column if not exists last_low_stock_alert_at  timestamptz;

alter table tenant
  add column if not exists stock_alert_enabled             boolean     not null default false,
  add column if not exists stock_alert_default_threshold   integer     not null default 5,
  add column if not exists stock_alert_recipients          text[]      not null default '{}'::text[];

-- CHECK the threshold is sane.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'product_variant_low_stock_threshold_check'
  ) then
    alter table product_variant
      add constraint product_variant_low_stock_threshold_check
      check (low_stock_threshold is null or low_stock_threshold >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenant_stock_alert_default_threshold_check'
  ) then
    alter table tenant
      add constraint tenant_stock_alert_default_threshold_check
      check (stock_alert_default_threshold >= 0 and stock_alert_default_threshold <= 10000);
  end if;
end $$;

-- Partial index keeps the sweep cheap: only variants that could
-- possibly be "low" (≤10 in stock, regardless of threshold). The
-- threshold comparison itself runs in the sweep query — keeping
-- that out of the index lets us avoid a per-row timestamp
-- dependency (now() in an index predicate must be IMMUTABLE, and
-- the version of now() we get is not).
create index if not exists product_variant_low_stock_idx
  on product_variant (tenant_id, inventory_quantity)
  where track_inventory = true
    and inventory_quantity <= 10;

-- Down migration
-- (see packages/db/sql/down/37_r7_stock_alert.down.sql)
