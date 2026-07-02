-- ============================================================================
-- 27_crm_task.sql — CRM tasks & follow-ups (admin, Phase R1.2). Additive,
-- idempotent; runs after 26.
--
-- A task is a staff to-do — "call back", "confirm COD", "follow up quote" —
-- optionally pinned to a customer and/or order, with a due date, priority and
-- assignee. The dashboard surfaces what is due today / overdue so nothing slips.
-- Tenant-scoped with the standard RLS isolation, so tasks never leak across
-- stores. The is_platform_admin() escape keeps asPlatformAdmin tooling working.
-- ============================================================================

create table if not exists crm_task (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  title        text not null check (length(title) > 0 and length(title) <= 200),
  note         text,
  status       text not null default 'open',     -- open | done
  priority     text not null default 'normal',   -- low | normal | high
  due_at       timestamptz,
  customer_id  uuid references customer(id) on delete set null,
  order_id     uuid references orders(id) on delete set null,
  assignee_id  uuid references app_user(id) on delete set null,
  created_by   uuid references app_user(id) on delete set null,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists crm_task_tenant_due_idx
  on crm_task (tenant_id, status, due_at);
create index if not exists crm_task_customer_idx
  on crm_task (tenant_id, customer_id);

do $$
begin
  execute 'alter table crm_task enable row level security';
  execute 'alter table crm_task force row level security';
  if not exists (
    select 1 from pg_policies where tablename = 'crm_task' and policyname = 'crm_task_isolation'
  ) then
    create policy crm_task_isolation on crm_task
      for all using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
      with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'crm_task_set_updated_at'
  ) then
    create trigger crm_task_set_updated_at
      before update on crm_task
      for each row execute function set_updated_at();
  end if;
end $$;

grant select, insert, update, delete on crm_task to app_runtime;
