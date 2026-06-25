-- ============================================================================
-- 13_loyalty.sql — Loyalty points (tenant roadmap P3-2). Additive. Same
-- isolation contract as 02_policies.sql §2. Idempotent; runs once after 12.
--
-- A points program drives repeat purchase: earn on delivered orders, redeem as
-- a taka discount. loyalty_program holds the per-tenant rates; loyalty_ledger is
-- a signed transaction log (balance = sum of points), so earns/redeems stay
-- auditable and a balance can never silently drift.
-- ============================================================================

create table if not exists loyalty_program (
  tenant_id      uuid primary key references tenant(id) on delete cascade,
  enabled        boolean not null default false,
  earn_per_100   integer not null default 1,        -- points earned per 100 BDT spent
  taka_per_point numeric(10,2) not null default 1,  -- redemption value of 1 point
  updated_at     timestamptz not null default now()
);

create table if not exists loyalty_ledger (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  customer_id uuid not null references customer(id) on delete cascade,
  order_id    uuid references orders(id) on delete set null,
  points      integer not null,                     -- + earn, - redeem
  reason      text not null default 'earn',         -- 'earn' | 'redeem' | 'adjust'
  created_at  timestamptz not null default now()
);
create index if not exists loyalty_ledger_customer_idx
  on loyalty_ledger (tenant_id, customer_id);
-- One earn per order — the partial unique index makes double-award impossible.
create unique index if not exists loyalty_ledger_earn_once_idx
  on loyalty_ledger (tenant_id, order_id) where reason = 'earn';

do $$
declare t text;
  tbls text[] := array['loyalty_program', 'loyalty_ledger'];
begin
  foreach t in array tbls loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_isolation') then
      execute format($f$
        create policy %1$I_isolation on %1$I
          using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
          with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
      $f$, t);
    end if;
  end loop;
end $$;

grant select, insert, update, delete on loyalty_program, loyalty_ledger to app_runtime;
