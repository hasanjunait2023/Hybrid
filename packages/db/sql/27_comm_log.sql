-- ============================================================================
-- 27_comm_log.sql — Customer communication log (SMS + email).
-- Additive, idempotent; runs after 26.
--
-- Closes the H1 half-built feature (`vault/10-Features/comms-log.md`):
-- `getCustomerDetail().communications` previously returned `[]` because the
-- tables and write path did not exist. This migration adds both tables and
-- tenant RLS isolation so the UI can read what the SMS / email writers log.
--
-- Tenant-scoped with the standard `app.current_tenant_id()` RLS — segments
-- never leak across stores.
-- ============================================================================

-- SMS messages sent to customers (one row per send attempt).
create table if not exists sms_log (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  customer_id   uuid references customer(id) on delete set null,
  -- Free-form phone number the SMS was sent to (kept even if customer row
  -- is later deleted so the merchant can still audit historical sends).
  phone         text not null,
  -- Template key (e.g. 'customer.order.confirmation', 'customer.order.shipped')
  -- — the i18n key the renderer used.
  template_key  text not null,
  -- Rendered message body — captured at send time so logs don't drift if the
  -- template is edited later. 160-char limit is advisory; we allow up to 1000.
  body          text not null,
  -- 'queued' | 'sent' | 'failed' — matches the gateway adapter result.
  status        text not null default 'queued'
                  check (status in ('queued','sent','failed')),
  -- Gateway-reported failure reason, when status='failed'.
  error         text,
  sent_at       timestamptz not null default now()
);

create index if not exists sms_log_tenant_sent_at_idx
  on sms_log (tenant_id, sent_at desc);
create index if not exists sms_log_customer_idx
  on sms_log (customer_id, sent_at desc) where customer_id is not null;

-- Email messages sent to customers (one row per send attempt). Separate table
-- because the channel/storage shape will diverge (we'll add subject,
-- attachment refs, threading headers later).
create table if not exists email_log (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  customer_id   uuid references customer(id) on delete set null,
  to_email      text not null,
  template_key  text not null,
  subject       text not null,
  body          text not null,
  status        text not null default 'queued'
                  check (status in ('queued','sent','failed')),
  error         text,
  sent_at       timestamptz not null default now()
);

create index if not exists email_log_tenant_sent_at_idx
  on email_log (tenant_id, sent_at desc);
create index if not exists email_log_customer_idx
  on email_log (customer_id, sent_at desc) where customer_id is not null;

-- RLS isolation (idempotent pattern matches migration 26).
do $$
begin
  execute 'alter table sms_log enable row level security';
  execute 'alter table sms_log force row level security';
  if not exists (
    select 1 from pg_policies where tablename = 'sms_log' and policyname = 'sms_log_isolation'
  ) then
    create policy sms_log_isolation on sms_log
      for all using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
      with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
  end if;

  execute 'alter table email_log enable row level security';
  execute 'alter table email_log force row level security';
  if not exists (
    select 1 from pg_policies where tablename = 'email_log' and policyname = 'email_log_isolation'
  ) then
    create policy email_log_isolation on email_log
      for all using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
      with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
  end if;
end $$;

grant select, insert, update, delete on sms_log to app_runtime;
grant select, insert, update, delete on email_log to app_runtime;