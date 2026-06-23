-- ============================================================================
-- Hybrid — Auth provisioning bookend  |  File 05 (runs AFTER 04_grant_login.sql)
-- ----------------------------------------------------------------------------
-- Supabase Auth provider support (behind the getSession() seam). Adds the
-- `on_auth_user_created` trigger that mirrors a new auth.users row into
-- public.app_user (app_user.id = auth.users.id), so every authenticated
-- Supabase user has a matching app_user identity the rest of the app can join.
--
-- DOES NOT edit the canonical 01_schema.sql / 02_policies.sql. This is an
-- additive bookend applied after the schema/policies/grants are in place.
--
-- MINIMAL ON PURPOSE: the trigger inserts app_user ONLY. A trigger that throws
-- would block the signup INSERT on auth.users, so it must do as little as
-- possible. Tenant provisioning (tenant + domain + member + subscription) is a
-- separate Server Action (lib/auth/provision.ts -> provisionTenant) run AFTER
-- signup via asPlatformAdmin — NOT here.
--
-- GUARDED FOR LOCAL POSTGRES: the `auth` schema only exists in a real Supabase
-- database. On the local embedded/plain Postgres used by the test harness and
-- docker-compose, `auth.users` is absent, so the whole block no-ops gracefully
-- instead of erroring on a missing table.
-- ============================================================================

-- The function lives in `public` regardless; it is only WIRED to auth.users
-- when that schema exists. security definer + empty search_path is the Supabase
-- recommendation so the function resolves objects by fully-qualified name and is
-- not influenced by the caller's search_path.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.app_user (id, email, phone, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Wire the trigger only on a real Supabase DB (auth schema present). On local
-- plain/embedded Postgres this whole block is skipped, so 00-05 still apply
-- cleanly and the RLS suite stays green.
do $$
begin
  if exists (
    select 1 from information_schema.schemata where schema_name = 'auth'
  ) then
    -- Idempotent re-create so a re-applied migration stays clean.
    drop trigger if exists on_auth_user_created on auth.users;
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_auth_user();
  end if;
end $$;
