-- ============================================================================
-- 29_crm_journey.sql — CRM lifecycle automation (admin, Phase R1.4). Additive,
-- idempotent; runs after 28.
--
-- A journey is a segment/event-triggered message: post-delivery review request,
-- win-back of lapsed buyers, repeat-buyer thank-you. The runner (lib/crm/
-- runJourneys) evaluates each active journey's trigger against the tenant's
-- customers/orders and sends via the existing SMS/WhatsApp adapters, recording a
-- run row per (journey, customer, reference) so a recipient is never messaged
-- twice for the same event. Tenant-scoped RLS; is_platform_admin() escape kept.
-- ============================================================================

create table if not exists crm_journey (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenant(id) on delete cascade,
  name           text not null,
  -- review_request | win_back | repeat_buyer
  trigger        text not null,
  -- sms | whatsapp
  channel        text not null default 'sms',
  -- message body; supports the {name} placeholder
  message        text not null,
  -- review_request: days since delivered · win_back: days since last order
  threshold_days integer not null default 0,
  -- repeat_buyer: order-count milestone that triggers the thank-you
  min_orders     integer not null default 0,
  is_active      boolean not null default true,
  created_by     uuid references app_user(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists crm_journey_tenant_idx
  on crm_journey (tenant_id, is_active);

create table if not exists crm_journey_run (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  journey_id   uuid not null references crm_journey(id) on delete cascade,
  customer_id  uuid not null references customer(id) on delete cascade,
  -- order id for review_request; null for customer-lifecycle journeys
  reference_id uuid,
  status       text not null default 'sent', -- sent | failed
  created_at   timestamptz not null default now()
);
-- One run per (journey, customer, reference) — the idempotency guard. The
-- coalesce sentinel folds the null-reference (lifecycle) case into the unique key.
create unique index if not exists crm_journey_run_uniq
  on crm_journey_run (
    journey_id, customer_id,
    coalesce(reference_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

do $$
begin
  execute 'alter table crm_journey enable row level security';
  execute 'alter table crm_journey force row level security';
  if not exists (select 1 from pg_policies where tablename = 'crm_journey' and policyname = 'crm_journey_isolation') then
    create policy crm_journey_isolation on crm_journey
      for all using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
      with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
  end if;

  execute 'alter table crm_journey_run enable row level security';
  execute 'alter table crm_journey_run force row level security';
  if not exists (select 1 from pg_policies where tablename = 'crm_journey_run' and policyname = 'crm_journey_run_isolation') then
    create policy crm_journey_run_isolation on crm_journey_run
      for all using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
      with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'crm_journey_set_updated_at') then
    create trigger crm_journey_set_updated_at
      before update on crm_journey
      for each row execute function set_updated_at();
  end if;
end $$;

grant select, insert, update, delete on crm_journey to app_runtime;
grant select, insert, update, delete on crm_journey_run to app_runtime;
