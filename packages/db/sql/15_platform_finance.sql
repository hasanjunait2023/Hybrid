-- ============================================================================
-- 15_platform_finance.sql — Platform accounting (tenant roadmap PP1-B2).
-- Additive. Idempotent; runs once after 14.
--
-- Platform table (Hybrid's own books), is_platform_admin-guarded — NOT tenant
-- RLS. Revenue is derived from paid invoices (already in DB); this table holds
-- the EXPENSE side so the platform P&L (revenue − expenses) is computable.
-- ============================================================================

create table if not exists platform_expense (
  id          uuid primary key default gen_random_uuid(),
  category    text not null default 'other',   -- infra|sms|courier|gateway|salary|marketing|other
  vendor      text,
  amount      numeric(14,2) not null check (amount >= 0),
  note        text,
  incurred_on date not null default current_date,
  created_by  uuid references app_user(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists platform_expense_date_idx on platform_expense (incurred_on desc);
create index if not exists platform_expense_category_idx on platform_expense (category);

do $$
begin
  execute 'alter table platform_expense enable row level security';
  execute 'alter table platform_expense force row level security';
  if not exists (select 1 from pg_policies where tablename = 'platform_expense' and policyname = 'platform_expense_admin') then
    create policy platform_expense_admin on platform_expense
      using (app.is_platform_admin()) with check (app.is_platform_admin());
  end if;
end $$;

grant select, insert, update, delete on platform_expense to app_runtime;
