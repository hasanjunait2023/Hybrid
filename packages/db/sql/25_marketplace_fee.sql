-- ============================================================================
-- 25_marketplace_fee.sql — Wholesale marketplace MONTHLY FEE (commission model).
-- Additive. Idempotent; runs after 24.
--
-- Founder decision (2026-06-29): the marketplace commission model is a flat
-- MONTHLY FEE per wholesaler, NOT a per-transaction percentage. The existing
-- marketplace_commission table stays as a record-only per-order ledger; revenue
-- is driven by this monthly fee instead.
--
--   * tenant.marketplace_monthly_fee — the configured fee for that wholesaler
--     (0 = not on a paid marketplace plan).
--   * marketplace_fee — one billed line per (tenant, month). Platform table
--     (Hybrid's own books), is_platform_admin-guarded — NOT tenant RLS, same
--     pattern as platform_expense (15_platform_finance.sql).
-- ============================================================================

alter table tenant
  add column if not exists marketplace_monthly_fee numeric(14,2) not null default 0;

create table if not exists marketplace_fee (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  period_month date not null,                       -- first-of-month (Dhaka)
  amount       numeric(14,2) not null check (amount >= 0),
  status       text not null default 'pending',     -- pending | paid | waived
  note         text,
  paid_at      timestamptz,
  created_at   timestamptz not null default now(),
  unique (tenant_id, period_month)
);
create index if not exists marketplace_fee_period_idx on marketplace_fee (period_month desc);
create index if not exists marketplace_fee_status_idx on marketplace_fee (status);

do $$
begin
  execute 'alter table marketplace_fee enable row level security';
  execute 'alter table marketplace_fee force row level security';
  if not exists (
    select 1 from pg_policies
     where tablename = 'marketplace_fee' and policyname = 'marketplace_fee_admin'
  ) then
    create policy marketplace_fee_admin on marketplace_fee
      using (app.is_platform_admin()) with check (app.is_platform_admin());
  end if;
end $$;

grant select, insert, update, delete on marketplace_fee to app_runtime;
