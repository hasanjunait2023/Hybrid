-- ============================================================================
-- 28_sla.sql — BD Digital Commerce Guidelines 2021 SLA tracking
-- Additive, idempotent; runs after 27.
--
-- Implements the SLA deadline surface from docs/research/roadmap-gap-plan.md
-- §B.3 (Digital Commerce Guidelines 2021):
--   - 48h courier handover (after order placement)
--   - 5d delivery (same-city) / 10d delivery (out-of-city)
--   - 10d refund window (after delivery failure)
--
-- Two deadlines are stamped at order placement time (so the per-order SLA is
-- immutable from then on — moving the timer requires an admin override):
--   sla_handover_deadline_at    — placed_at + 48h (regardless of city)
--   sla_delivery_deadline_at    — placed_at + 5d (same-city) OR +10d (out)
--   sla_refund_window_closes_at — delivery-failure (or pending) + 10d
--
-- The `sla_alert_log` table is the dedupe ledger for "we already alerted the
-- merchant about this SLA breach" — the sweeper reads it to avoid re-pinging
-- the same merchant every 30 minutes for the same overdue shipment.
--
-- We do NOT touch the existing `order_fulfillment_status` enum — those values
-- stay authoritative for the state machine. SLA deadlines are a parallel
-- concern (a shipment can be 'in_transit' AND overdue for delivery if the
-- courier is dragging its feet).
--
-- Tenant-scoped via the standard `app.current_tenant_id()` RLS — already used
-- by 27_comm_log.sql, so this follows the same pattern.
-- ============================================================================

-- SLA deadline columns on `orders`. Stamped at placement; immutable thereafter.
-- Same-city vs out-city is determined at placement time and frozen into
-- `sla_zone` so re-computation against a future city table doesn't change
-- history.
alter table orders
  add column if not exists sla_zone               text
    check (sla_zone in ('same_city','out_city')),
  add column if not exists sla_handover_deadline_at    timestamptz,
  add column if not exists sla_delivery_deadline_at    timestamptz,
  add column if not exists sla_refund_window_closes_at timestamptz,
  add column if not exists sla_overridden_by            uuid references auth.users(id) on delete set null,
  add column if not exists sla_overridden_reason       text;

-- Partial index — sweeper only scans active orders (not delivered/cancelled/
-- returned). Keeps the 30-min sweep cheap even at 100k+ orders.
create index if not exists orders_sla_sweep_idx
  on orders (tenant_id, sla_handover_deadline_at)
  where fulfillment_status in ('pending','confirmed','packed','shipped','in_transit');

create index if not exists orders_sla_delivery_idx
  on orders (tenant_id, sla_delivery_deadline_at)
  where fulfillment_status in ('pending','confirmed','packed','shipped','in_transit');

-- Dedupe ledger — one row per (order, alert_kind) we have already sent.
-- On conflict, the sweeper skips re-pinging.
create table if not exists sla_alert_log (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  order_id     uuid not null references orders(id) on delete cascade,
  -- Which deadline triggered this alert (matches the orders.sla_* column name).
  alert_kind   text not null
    check (alert_kind in (
      'handover_overdue',
      'delivery_overdue',
      'refund_window_closing',
      'refund_window_closed'
    )),
  -- Who got pinged (merchant user id; the merchant is who needs to act on a
  -- courier-side breach, not the customer).
  recipient_user_id uuid references auth.users(id) on delete set null,
  channel      text not null check (channel in ('sms','email','in_app')),
  sent_at      timestamptz not null default now(),
  -- Composite uniqueness ensures the sweeper never re-pings the same order for
  -- the same alert kind on the same channel.
  unique (order_id, alert_kind, channel)
);

create index if not exists sla_alert_log_tenant_idx
  on sla_alert_log (tenant_id, sent_at desc);

-- RLS isolation (idempotent pattern matching 26/27).
do $$
begin
  execute 'alter table sla_alert_log enable row level security';
  execute 'alter table sla_alert_log force row level security';
  if not exists (
    select 1 from pg_policies where tablename = 'sla_alert_log' and policyname = 'sla_alert_log_isolation'
  ) then
    create policy sla_alert_log_isolation on sla_alert_log
      for all using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
      with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
  end if;
end $$;

grant select, insert, update, delete on sla_alert_log to app_runtime;