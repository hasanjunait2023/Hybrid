-- ============================================================================
-- Hybrid Storefront — Row-Level Security (RLS)
-- PostgreSQL Policies            |  File 2 of 2  (run AFTER 01_schema.sql)
-- ----------------------------------------------------------------------------
-- Security contract: a query may only ever touch rows of the tenant set in the
-- `app.current_tenant_id` session variable. The application sets this per
-- request after authenticating the user and resolving the tenant:
--
--     SELECT set_config('app.current_tenant_id', '<tenant-uuid>', true);
--     SELECT set_config('app.current_user_id',   '<user-uuid>',   true);  -- optional
--     SELECT set_config('app.is_platform_admin', 'true', true);           -- super-admin only
--
-- Notes:
--   * Policies run for non-superuser roles. Connect runtime traffic as the
--     `app_runtime` role (created below). Superusers / BYPASSRLS roles skip RLS
--     entirely — keep migrations/seed jobs separate from runtime.
--   * FORCE RLS is enabled so even the table owner is subject to policies.
--   * Platform tables (plan, theme) are world-readable so signup/storefront can
--     list them; writes require is_platform_admin.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Helper functions (app schema)
-- ---------------------------------------------------------------------------
create schema if not exists app;

create or replace function app.current_tenant_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.current_tenant_id', true), '')::uuid
$$;

create or replace function app.current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

create or replace function app.is_platform_admin() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('app.is_platform_admin', true), '')::boolean, false)
$$;

-- ---------------------------------------------------------------------------
-- 1. Runtime application role
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    create role app_runtime nologin;
  end if;
end $$;

grant usage on schema public, app to app_runtime;
grant select, insert, update, delete on all tables in schema public to app_runtime;
grant usage, select on all sequences in schema public to app_runtime;
grant execute on all functions in schema app to app_runtime;
alter default privileges in schema public
  grant select, insert, update, delete on tables to app_runtime;
alter default privileges in schema public
  grant usage, select on sequences to app_runtime;

-- ---------------------------------------------------------------------------
-- 2. Standard tenant isolation for all tenant-scoped tables
--    Visible/writable iff tenant_id = current tenant OR caller is platform admin.
-- ---------------------------------------------------------------------------
do $$
declare t text;
  tenant_tables text[] := array[
    'tenant_domain',
    'tenant_theme_settings','store_page','navigation_menu','landing_page',
    'collection','product','product_image','product_variant','product_collection',
    'customer','customer_address','discount',
    'order_counter','orders','order_item',
    'payment_account','payment',
    'courier_account','cod_remittance','shipment',
    'subscription','invoice','usage_counter',
    'analytics_event','audit_log','webhook_event'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
    execute format($f$
      create policy %1$I_isolation on %1$I
        using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
        with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Platform tables — plan, theme  (public read, admin write)
-- ---------------------------------------------------------------------------
alter table plan  enable row level security;
alter table plan  force row level security;
create policy plan_read   on plan for select using (true);
create policy plan_insert on plan for insert with check (app.is_platform_admin());
create policy plan_update on plan for update using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy plan_delete on plan for delete using (app.is_platform_admin());

alter table theme enable row level security;
alter table theme force row level security;
create policy theme_read   on theme for select using (true);
create policy theme_insert on theme for insert with check (app.is_platform_admin());
create policy theme_update on theme for update using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy theme_delete on theme for delete using (app.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 4. app_user — a user sees only self; platform admin sees all
-- ---------------------------------------------------------------------------
alter table app_user enable row level security;
alter table app_user force row level security;
create policy app_user_select on app_user for select
  using (id = app.current_user_id() or app.is_platform_admin());
create policy app_user_update on app_user for update
  using (id = app.current_user_id() or app.is_platform_admin())
  with check (id = app.current_user_id() or app.is_platform_admin());
create policy app_user_insert on app_user for insert
  with check (app.is_platform_admin() or id = app.current_user_id());
create policy app_user_delete on app_user for delete
  using (app.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 5. tenant — visible if it's the active tenant, the caller is a member,
--    or platform admin. Mutations require active-tenant context or admin.
-- ---------------------------------------------------------------------------
alter table tenant enable row level security;
alter table tenant force row level security;
create policy tenant_select on tenant for select
  using (
    id = app.current_tenant_id()
    or app.is_platform_admin()
    or exists (
      select 1 from tenant_member m
      where m.tenant_id = tenant.id and m.user_id = app.current_user_id()
    )
  );
create policy tenant_insert on tenant for insert
  with check (app.is_platform_admin() or owner_user_id = app.current_user_id());
create policy tenant_update on tenant for update
  using (id = app.current_tenant_id() or app.is_platform_admin())
  with check (id = app.current_tenant_id() or app.is_platform_admin());
create policy tenant_delete on tenant for delete
  using (app.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 6. tenant_member — scoped to current tenant, or the caller's own membership
-- ---------------------------------------------------------------------------
alter table tenant_member enable row level security;
alter table tenant_member force row level security;
create policy tenant_member_select on tenant_member for select
  using (
    tenant_id = app.current_tenant_id()
    or user_id = app.current_user_id()
    or app.is_platform_admin()
  );
create policy tenant_member_write on tenant_member for all
  using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
  with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());

-- ============================================================================
-- End of File 2. RLS is now enforced. Quick self-test (psql):
--
--   set role app_runtime;
--   select set_config('app.current_tenant_id', '<tenantA-uuid>', false);
--   select count(*) from product;     -- sees ONLY tenant A's products
--   reset role;
-- ============================================================================
