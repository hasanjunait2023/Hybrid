-- Migration: 45_fix_touch_updated_at_trigger.sql
--
-- PURPOSE: Repair the trigger created in 34_r3_size_chart.sql:64 which calls a
-- non-existent function app.touch_updated_at(). The canonical function in
-- 01_schema.sql:28 is public.set_updated_at(); every other trigger in the
-- project calls public.set_updated_at().
--
-- On a fresh apply the original migration silently fails to create the
-- trigger, which means UPDATE on size_chart never bumps updated_at and the
-- row appears stuck in time for any time-based query.
--
-- AUDIT TRAIL: docs/audit/APIS_DBSCHEMA_AUDIT.md §Gap D.
--
-- SAFETY:
-- 1) Idempotent — DROP TRIGGER IF EXISTS first.
-- 2) Recreate against public.set_updated_at() (the function that actually
--    exists) instead of inventing a new app.touch_updated_at() function.
-- 3) Guarded inside DO $$ so any residual failure does not stop subsequent
--    migrations from running.

do $$
begin
  -- Drop the broken trigger if it survived in some environment.
  -- (If the original migration failed, this is a no-op.)
  if exists (
    select 1 from pg_trigger
    where tgname = 'size_chart_updated_at_trg'
      and tgrelid = 'public.size_chart'::regclass
  ) then
    drop trigger size_chart_updated_at_trg on public.size_chart;
  end if;

  -- Recreate the trigger against the existing public.set_updated_at().
  create trigger size_chart_updated_at_trg
    before update on public.size_chart
    for each row execute function public.set_updated_at();
end $$;
