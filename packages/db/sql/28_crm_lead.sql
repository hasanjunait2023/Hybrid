-- ============================================================================
-- 28_crm_lead.sql — CRM lead / pre-customer pipeline (admin, Phase R1.3).
-- Additive, idempotent; runs after 27.
--
-- A lead is a prospect who hasn't ordered yet — a Facebook/WhatsApp inquiry, an
-- abandoned cart, or a walk-in the seller wants to chase. It moves through a
-- pipeline (new → contacted → qualified → won/lost) and, once it converts, links
-- to the customer it became. Tenant-scoped with the standard RLS isolation; the
-- is_platform_admin() escape keeps asPlatformAdmin tooling working.
-- ============================================================================

create table if not exists crm_lead (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenant(id) on delete cascade,
  name             text,
  phone            text,
  -- where the lead came from: manual | abandoned_cart | inquiry | facebook | whatsapp
  source           text not null default 'manual',
  -- pipeline stage: new | contacted | qualified | won | lost
  stage            text not null default 'new',
  est_value        numeric(14,2) not null default 0,
  note             text,
  customer_id      uuid references customer(id) on delete set null,
  assignee_id      uuid references app_user(id) on delete set null,
  created_by       uuid references app_user(id) on delete set null,
  last_activity_at timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists crm_lead_tenant_stage_idx
  on crm_lead (tenant_id, stage, last_activity_at desc);
create index if not exists crm_lead_phone_idx
  on crm_lead (tenant_id, phone);

do $$
begin
  execute 'alter table crm_lead enable row level security';
  execute 'alter table crm_lead force row level security';
  if not exists (
    select 1 from pg_policies where tablename = 'crm_lead' and policyname = 'crm_lead_isolation'
  ) then
    create policy crm_lead_isolation on crm_lead
      for all using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
      with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'crm_lead_set_updated_at'
  ) then
    create trigger crm_lead_set_updated_at
      before update on crm_lead
      for each row execute function set_updated_at();
  end if;
end $$;

grant select, insert, update, delete on crm_lead to app_runtime;
