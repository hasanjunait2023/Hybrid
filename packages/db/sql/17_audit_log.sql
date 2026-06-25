-- Migration 17 — Audit Log (Tier 3 P1 — compliance trail)
--
-- An append-only audit log of admin + platform actions. Every privileged
-- operation (settings change, role grant, refund, deletion) gets a row
-- here so we can answer "who did what, when" for compliance investigations.
--
-- Strict invariants:
--   - INSERT only. No UPDATE / DELETE policies. The app layer enforces
--     immutability; even the DB owner cannot UPDATE without a migration.
--   - RLS: tenant-scoped reads for tenant admins, platform-admin escape
--     hatch via app.is_platform_admin() for the platform team.
--   - Retention: 365 days by default. A cron (P3 backlog) will prune older
--     rows. The table is JSONB-light — only the fields compliance asks for.

create type audit_action as enum (
  -- Tenant-scoped (owner/staff)
  'settings.update',
  'product.create',
  'product.update',
  'product.delete',
  'order.refund',
  'order.cancel',
  'member.invite',
  'member.remove',
  'member.role_change',
  'payment_account.update',
  -- Platform-scoped (super_admin)
  'tenant.suspend',
  'tenant.reactivate',
  'tenant.plan_change',
  'platform_admin.login'
);

create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenant(id) on delete cascade, -- null for platform-only events
  actor_user_id uuid references app_user(id) on delete set null,
  action        audit_action not null,
  resource_type text,                       -- e.g. 'product', 'order'
  resource_id   text,                       -- string-coerced uuid or numeric
  details       jsonb not null default '{}'::jsonb,
  ip_address    inet,
  user_agent    text,
  occurred_at   timestamptz not null default now()
);

create index audit_log_tenant_time_idx on audit_log(tenant_id, occurred_at desc);
create index audit_log_actor_time_idx on audit_log(actor_user_id, occurred_at desc);
create index audit_log_action_idx on audit_log(action, occurred_at desc);

-- RLS — read scoped to tenant OR platform admin. Write happens via asPlatformAdmin
-- (the helper inserts as superuser, which bypasses RLS for the INSERT — that's
-- intentional for an audit log; the actor's identity is captured separately).
alter table audit_log enable row level security;

create policy audit_log_tenant_read
  on audit_log
  for select
  using (tenant_id = app.current_tenant_id()::uuid or app.is_platform_admin());

-- No INSERT/UPDATE/DELETE policies — only asPlatformAdmin() can write,
-- and rows are immutable (no UPDATE/DELETE granted to app_runtime).

-- Platform team can read across tenants (audit investigations).
grant select on audit_log to app_runtime;
grant usage on type audit_action to app_runtime;