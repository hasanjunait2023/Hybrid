-- ============================================================================
-- 11_marketing.sql — Marketing broadcast campaigns (tenant roadmap P2-4).
-- Additive. Same isolation contract as 02_policies.sql §2 (RLS enabled+FORCED,
-- policy keyed on app.current_tenant_id()). Idempotent; runs once after 10.
--
-- A campaign records a broadcast: channel (SMS now; WhatsApp later — needs
-- approved templates), audience preset, message, and send outcome. The actual
-- dispatch reuses the existing SMS adapter (gated by SMS_LIVE), so this table is
-- the durable record + audit, not a queue.
-- ============================================================================

create table if not exists campaign (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  channel         text not null default 'sms',     -- 'sms' | 'whatsapp'
  audience        text not null default 'all',     -- 'all' | 'repeat'
  message         text not null,
  status          text not null default 'draft',   -- 'draft' | 'sent'
  recipient_count integer not null default 0,
  sent_count      integer not null default 0,
  created_by      uuid references app_user(id) on delete set null,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index if not exists campaign_tenant_idx on campaign (tenant_id, created_at desc);

do $$
begin
  execute 'alter table campaign enable row level security';
  execute 'alter table campaign force row level security';
  if not exists (select 1 from pg_policies where tablename = 'campaign' and policyname = 'campaign_isolation') then
    create policy campaign_isolation on campaign
      using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
      with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
  end if;
end $$;

grant select, insert, update, delete on campaign to app_runtime;
