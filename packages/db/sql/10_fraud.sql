-- ============================================================================
-- 10_fraud.sql — COD fraud / phone blocklist (tenant roadmap P1 #2). Additive.
--
-- Same isolation contract as 02_policies.sql §2: RLS enabled + FORCED, policy
-- keyed on app.current_tenant_id(). Idempotent; runs once after 09.
--
-- BD context: COD RTO/fraud (fake orders, repeat non-responders) is a top
-- operational loss. Sellers keep manual "blocked number" lists today. This
-- table makes the blocklist first-class; duplicate-order + prior-cancel signals
-- are computed in the data layer (no schema needed); the external phone-risk
-- lookup (FraudBD / FraudChecker) is a credential-gated adapter.
-- ============================================================================

create table if not exists phone_blocklist (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  phone       text not null,
  reason      text,
  created_by  uuid references app_user(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (tenant_id, phone)
);
create index if not exists phone_blocklist_tenant_phone_idx
  on phone_blocklist (tenant_id, phone);

-- ---- RLS: identical isolation contract as 02_policies.sql §2 ----------------
do $$
begin
  execute 'alter table phone_blocklist enable row level security';
  execute 'alter table phone_blocklist force row level security';
  if not exists (
    select 1 from pg_policies
    where tablename = 'phone_blocklist' and policyname = 'phone_blocklist_isolation'
  ) then
    create policy phone_blocklist_isolation on phone_blocklist
      using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
      with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
  end if;
end $$;

grant select, insert, update, delete on phone_blocklist to app_runtime;
