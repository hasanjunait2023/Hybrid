-- Migration: 48_dbid_submission_canonicalize.sql
--
-- PURPOSE: Idempotently apply the standard tenant-isolation RLS pattern to
-- dbid_submission on the running production DB, mirroring what 02_policies.sql
-- does for every other table in its loop. dbid_submission was originally
-- created in 22_dbid.sql which ships its own enable/force + a custom policy
-- named `dbid_submission_isolation` (matches the canonical pattern but with
-- the `_isolation` suffix). The policy itself is correct; the gap is that the
-- canonical 02_policies.sql array didn't include it, so future audits parsing
-- only 02 will miscount RLS coverage.
--
-- Source-side fix: 02_policies.sql has been amended to include dbid_submission
-- in its tenant_tables array (so future fresh DBs include it in the loop).
-- This migration applies the same change to the LIVE database, idempotently.
--
-- AUDIT TRAIL: docs/audit/APIS_DBSCHEMA_AUDIT.md §Gap E.
--
-- SAFETY:
-- 1. ENABLE + FORCE are idempotent (no-ops if already set).
-- 2. Policy existence check via pg_policies (correct catalog view).
-- 3. Behaviour-equivalent to 22_dbid.sql:88-91.

do $$
begin
  -- Idempotent enable (skip if already enabled).
  if not exists (
    select 1 from pg_class c
      join pg_namespace n on c.relnamespace = n.oid
    where n.nspname = 'public'
      and c.relname = 'dbid_submission'
      and c.relrowsecurity = true
  ) then
    alter table public.dbid_submission enable row level security;
  end if;

  -- Idempotent force (skip if already forced). Note: relforcerowsecurity is
  -- on pg_class, NOT in pg_tables (which only has relrowsecurity).
  if not exists (
    select 1 from pg_class c
      join pg_namespace n on c.relnamespace = n.oid
    where n.nspname = 'public'
      and c.relname = 'dbid_submission'
      and c.relforcerowsecurity = true
  ) then
    alter table public.dbid_submission force row level security;
  end if;

  -- Create the canonical isolation policy if no policy exists yet. (22_dbid.sql
  -- already created one with the same name, so this is a no-op in normal flow.)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'dbid_submission'
  ) then
    create policy dbid_submission_isolation on public.dbid_submission
      using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
      with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
  end if;
end $$;
