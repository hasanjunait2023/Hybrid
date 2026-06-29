-- ============================================================================
-- 30_cod_risk_signal.sql — COD fraud network signal (admin, Phase R2.2).
-- Additive, idempotent; runs after the latest migration.
--
-- The differentiator nobody offers BD sellers: a privacy-safe, cross-tenant
-- fraud network. Each store records a signal when a phone burns it (an order
-- cancelled, returned/RTO, or the number blocked). The platform then exposes
-- ONLY an aggregate to other stores — "flagged by N other shops" — never which
-- shops, never any order detail. A scammer who hits store A warns store B.
--
-- Writes are tenant-scoped (RLS). The aggregate read runs as the platform admin
-- (asPlatformAdmin) and returns counts only — the is_platform_admin() escape on
-- the policy permits that cross-tenant aggregate without exposing rows to tenants.
-- ============================================================================

create table if not exists cod_risk_signal (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  phone       text not null,
  kind        text not null,  -- rto | cancel | block
  order_id    uuid references orders(id) on delete set null,
  created_at  timestamptz not null default now()
);
-- Network lookups are by phone; per-tenant reads by tenant.
create index if not exists cod_risk_signal_phone_idx
  on cod_risk_signal (phone);
create index if not exists cod_risk_signal_tenant_idx
  on cod_risk_signal (tenant_id, created_at desc);
-- One signal per (tenant, phone, kind, order) — re-cancelling the same order or
-- re-blocking a number never inflates the network count.
create unique index if not exists cod_risk_signal_uniq
  on cod_risk_signal (
    tenant_id, phone, kind,
    coalesce(order_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

do $$
begin
  execute 'alter table cod_risk_signal enable row level security';
  execute 'alter table cod_risk_signal force row level security';
  if not exists (
    select 1 from pg_policies where tablename = 'cod_risk_signal' and policyname = 'cod_risk_signal_isolation'
  ) then
    create policy cod_risk_signal_isolation on cod_risk_signal
      for all using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
      with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
  end if;
end $$;

grant select, insert, update, delete on cod_risk_signal to app_runtime;
