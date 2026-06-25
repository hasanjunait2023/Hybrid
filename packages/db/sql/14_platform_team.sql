-- ============================================================================
-- 14_platform_team.sql — Internal team management (tenant roadmap PP1-B1).
-- Additive. Idempotent; runs once after 13.
--
-- These are PLATFORM tables (Hybrid's own org), NOT tenant-scoped. Access is
-- gated by app.is_platform_admin() (read + write) — same pattern as plan/theme
-- writes — so only the super-admin surface (asPlatformAdmin) touches them. They
-- are NOT in the tenant-isolation loop of 02_policies.sql.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'platform_role') then
    create type platform_role as enum ('super_admin', 'support', 'sales', 'accountant', 'ops');
  end if;
end $$;

-- Hybrid staff + their platform role. user_id also carries app_user.is_platform_admin
-- (the coarse gate); this table adds the granular role.
create table if not exists platform_member (
  user_id    uuid primary key references app_user(id) on delete cascade,
  role       platform_role not null default 'support',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Account-manager assignment: which staffer owns a tenant relationship.
create table if not exists tenant_assignment (
  tenant_id   uuid primary key references tenant(id) on delete cascade,
  user_id     uuid not null references app_user(id) on delete cascade,
  assigned_at timestamptz not null default now()
);
create index if not exists tenant_assignment_user_idx on tenant_assignment (user_id);

-- RLS: platform-admin only (internal data). Not tenant-keyed.
do $$
declare t text;
  tbls text[] := array['platform_member', 'tenant_assignment'];
begin
  foreach t in array tbls loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_admin') then
      execute format($f$
        create policy %1$I_admin on %1$I
          using (app.is_platform_admin()) with check (app.is_platform_admin());
      $f$, t);
    end if;
  end loop;
end $$;

grant select, insert, update, delete on platform_member, tenant_assignment to app_runtime;
