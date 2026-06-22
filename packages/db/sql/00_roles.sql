-- ============================================================================
-- Hybrid — 00_roles.sql  (runs FIRST, before 01_schema.sql)
-- ----------------------------------------------------------------------------
-- The NOLOGIN fix (Phase 0 brief, Finding 2). Canonical 01/02/03 are untouched.
--
-- 02_policies.sql creates the GROUP role `app_runtime` as NOLOGIN and grants it
-- table/sequence/function privileges. A NOLOGIN role cannot open a connection
-- (FATAL: role is not permitted to log in), so runtime traffic needs a LOGIN
-- role that INHERITs those grants.
--
-- Here we create `app_runtime_login` (LOGIN, INHERIT). 04_grant_login.sql runs
-- LAST and does `grant app_runtime to app_runtime_login;` once the group exists.
--
-- Runtime (DATABASE_URL) connects as app_runtime_login  -> non-superuser -> RLS forced.
-- Migrations/seed (DIRECT_URL) connect as postgres        -> superuser    -> RLS bypassed.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_runtime_login') then
    create role app_runtime_login login password 'app_runtime_local_pw' inherit;
  end if;
end $$;
