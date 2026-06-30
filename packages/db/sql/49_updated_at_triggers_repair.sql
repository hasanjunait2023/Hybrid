-- Migration: 49_updated_at_triggers_repair.sql
--
-- PURPOSE: One-shot corrective migration that installs the canonical
-- set_updated_at() trigger on every public table that has an updated_at
-- column but is missing its `_set_updated_at` companion trigger. Brings the
-- timestamp-maintenance contract back to the documented invariant (every
-- table with updated_at columns gets a trigger that bumps it on UPDATE).
--
-- AUDIT TRAIL: docs/audit/APIS_DBSCHEMA_AUDIT.md §Gap G — initial audit
-- identified 13+ tables where updated_at was frozen at insert time.
--
-- SAFETY:
-- 1. Idempotent: every CREATE TRIGGER sits inside an `if not exists` guard
--    (via pg_trigger lookup), so re-running this migration is a no-op.
-- 2. The canonical trigger function is public.set_updated_at()
--    (defined at 01_schema.sql:28); we never invent a new function.
-- 3. We intentionally do NOT touch tables that already have a _set_updated_at
--    trigger (dbid_submission, purchase_request) — they have their own custom
--    trigger and the audit confirmed those work. Touching them risks double-
--    firing the trigger function and is unnecessary.
-- 4. The list is hand-curated from the audit's inventory. Tables without an
--    updated_at column are excluded (cart_reminder, order_note, etc.).

do $$
declare
  -- (table_name, trigger_name) pairs — every entry has updated_at + is missing
  -- a set_updated_at trigger per the audit. Order does not matter.
  target_tables text[][] := array[
    array['size_chart',   'size_chart_set_updated_at'],     -- already created by 45; guard for idem
    array['return_request',  'return_request_set_updated_at'],
    array['loyalty_program', 'loyalty_program_set_updated_at'],
    array['platform_member', 'platform_member_set_updated_at'],
    array['shipping_config', 'shipping_config_set_updated_at'],
    array['shipping_zone_rate', 'shipping_zone_rate_set_updated_at'],
    array['marketplace_config',  'marketplace_config_set_updated_at'],
    array['marketplace_customer','marketplace_customer_set_updated_at'],
    array['marketplace_order',   'marketplace_order_set_updated_at'],
    array['marketplace_suborder','marketplace_suborder_set_updated_at']
  ];
  rec text[];
begin
  foreach rec slice 1 in array target_tables loop
    -- Only create the trigger if (a) the table has an updated_at column AND
    -- (b) the trigger does not already exist.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = rec[1]
        and column_name = 'updated_at'
    ) and not exists (
      select 1 from pg_trigger
      where tgname = rec[2]
        and tgrelid = ('public.' || rec[1])::regclass
    ) then
      execute format(
        'create trigger %I before update on public.%I '
        'for each row execute function public.set_updated_at();',
        rec[2], rec[1]
      );
      raise notice 'created trigger % on table % (%)', rec[2], rec[1],
        (select pg_size_pretty(pg_total_relation_size('public.'||rec[1])));
    else
      raise notice 'skipped: trigger % already present on % or column missing', rec[2], rec[1];
    end if;
  end loop;
end $$;
