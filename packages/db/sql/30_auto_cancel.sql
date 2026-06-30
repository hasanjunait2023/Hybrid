-- ============================================================================
-- 30_auto_cancel.sql — O20 auto-cancel of unpaid orders
-- Additive, idempotent; runs after 29.
--
-- Implements the O20 sprint-1 spec:
--   * `orders.cancel_reason` — short string tag explaining WHY the order moved
--     to 'cancelled'. Null = manual / unannotated. Used by the auto-cancel
--     sweeper to stamp rows it cancels; future flows (admin / O22 expiry)
--     can stamp their own reasons too. CHECK keeps the values stable.
--   * `orders.cancel_after_at` — when the order is created, stamp now() +
--     AUTO_CANCEL_HOURS (default 48). The sweeper picks up orders whose
--     cancel_after_at <= now() AND payment_status='unpaid'. Stamping at
--     placement time keeps the sweep cheap (no `now() - interval` math) and
--     gives merchants a stable visible deadline in the UI.
--   * `auto_cancel_log` — sweep audit ledger. One row per (order, run) so a
--     merchant curious "did the 30-minute cron cancel my order, or did a
--     human?" gets a clean answer. The UNIQUE (order_id) constraint is
--     intentional — an order can be auto-cancelled at most once. Manual
--     cancellations do NOT touch this table.
--
-- Design notes:
--   * `cancelled_at` already exists from 01_schema.sql; we reuse it for both
--     manual and auto cancels. `cancel_reason` is the discriminator.
--   * `cancel_after_at` is independent of `sla_*_deadline_*` columns added
--     in 28_sla.sql — the auto-cancel timer is about *payment*, the SLA
--     timers are about *handover*. Two different policies.
--   * Partial index keeps the 30m sweep O(overdue + tiny) instead of
--     O(all_unpaid_orders).
-- ============================================================================

-- Why this row was cancelled. NULL = legacy row or manual cancel without
-- annotation. Sweeper stamps 'auto_unpaid'; future flows add their own.
alter table orders
  add column if not exists cancel_reason text
    check (cancel_reason in ('auto_unpaid', 'manual_no_annotation', 'admin')),
  add column if not exists cancel_after_at timestamptz;

-- Partial index — sweeper queries the narrow slice: unpaid orders whose
-- cancel-after deadline has elapsed. Bypasses the entire paid/cancelled
-- history, so the index stays small even at 100k+ orders.
create index if not exists orders_auto_cancel_sweep_idx
  on orders (tenant_id, cancel_after_at)
  where payment_status = 'unpaid'
    and fulfillment_status in ('pending', 'confirmed');

-- Sweep audit ledger. One row per order that was auto-cancelled (manual
-- cancels do NOT write here). Sellers/ops inspect this to see "did the
-- system cancel my order, and when?"
create table if not exists auto_cancel_log (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  order_id     uuid not null references orders(id) on delete cascade,
  -- Threshold in hours that produced this cancellation (so we can audit
  -- AUTO_CANCEL_HOURS changes over time without losing history).
  threshold_hours integer not null,
  -- Snapshot of the sweep "now" that triggered the cancel — useful for
  -- correlating log lines + SMS sends + admin "why was I cancelled?"
  -- complaints. Defaults to the row write time.
  cancelled_at     timestamptz not null default now(),
  -- How old the order was at cancellation time (computed from placed_at
  -- → cancel_after_at gap). Often close to threshold_hours but can drift
  -- by a few minutes depending on when the sweep lands.
  age_hours        numeric(10,2) not null,
  -- Uniqueness guarantees: even if the sweeper races itself (cron overlap,
  -- multi-instance deploy), only ONE auto-cancel row is ever recorded
  -- per order. The matching update is idempotent too (cancelled_at is set;
  -- re-running the sweep on a cancelled order just skips it).
  unique (order_id)
);

create index if not exists auto_cancel_log_tenant_idx
  on auto_cancel_log (tenant_id, cancelled_at desc);

-- RLS — same pattern as sla_alert_log (28_sla.sql). Tenant-scoped;
-- platform super-admin can see across.
do $$
begin
  execute 'alter table auto_cancel_log enable row level security';
  execute 'alter table auto_cancel_log force row level security';
  if not exists (
    select 1 from pg_policies where tablename = 'auto_cancel_log' and policyname = 'auto_cancel_log_isolation'
  ) then
    create policy auto_cancel_log_isolation on auto_cancel_log
      for all using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
      with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
  end if;
end $$;

grant select, insert, update, delete on auto_cancel_log to app_runtime;
