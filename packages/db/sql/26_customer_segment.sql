-- ============================================================================
-- 26_customer_segment.sql — Saved customer segments (admin). Additive,
-- idempotent; runs after 25.
--
-- A segment is a named, reusable filter over the tenant's customers: minimum
-- orders, minimum total spend, and an optional tag. Tenant-scoped with the
-- standard RLS isolation, so segments never leak across stores.
-- ============================================================================

create table if not exists customer_segment (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  name        text not null,
  min_orders  integer not null default 0,
  min_spent   numeric(14,2) not null default 0,
  tag         text,
  created_at  timestamptz not null default now()
);
create index if not exists customer_segment_tenant_idx
  on customer_segment (tenant_id, created_at desc);

do $$
begin
  execute 'alter table customer_segment enable row level security';
  execute 'alter table customer_segment force row level security';
  if not exists (
    select 1 from pg_policies where tablename = 'customer_segment' and policyname = 'cs_isolation'
  ) then
    create policy cs_isolation on customer_segment
      for all using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
      with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
  end if;
end $$;

grant select, insert, update, delete on customer_segment to app_runtime;
