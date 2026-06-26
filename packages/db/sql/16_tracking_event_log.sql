-- Migration 16 — Tracking infrastructure v2 (Tier 4 completion)
--
-- The existing analytics settings live on tenant.settings.analytics (jsonb)
-- with sealed credentials. That part works and we don't break it.
--
-- What's NEW in this migration is the **event log** — every server-side
-- tracking call (Meta CAPI, Google Ads, TikTok) gets recorded so the admin
-- UI can show "did the conversion go through?". Without this, sellers can't
-- see if their pixel fired and we can't debug delivery from the dashboard.
--
-- We also add a `tracking_settings_overrides` table per-tenant so tenants
-- can opt-in to richer tracking (e.g. server-side only, custom dedup window)
-- without re-editing tenant.settings.

-- ---------------------------------------------------------------------------
-- 16.1 tracking_event_log — every server-side event delivery attempt.
-- ---------------------------------------------------------------------------
create table if not exists tracking_event_log (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  event_id        text not null,           -- the dedup UUID (browser + server)
  event_name      text not null,           -- 'Purchase' | 'AddToCart' | 'Lead' | ...
  platform        text not null,           -- 'meta' | 'google' | 'tiktok'
  event_source    text not null,           -- 'browser' | 'server' | 'test'
  payload         jsonb,                   -- the data sent (PII-stripped)
  status          text not null,           -- 'sent' | 'failed' | 'skipped_consent' | 'duplicate'
  response_code   integer,
  response_body   text,                    -- truncated to 4kb
  error_message   text,
  occurred_at     timestamptz not null default now()
);

create index if not exists tracking_event_log_tenant_time_idx
  on tracking_event_log(tenant_id, occurred_at desc);

create index if not exists tracking_event_log_dedup_idx
  on tracking_event_log(tenant_id, event_id, platform);

create index if not exists tracking_event_log_status_idx
  on tracking_event_log(tenant_id, status, occurred_at desc);

-- ---------------------------------------------------------------------------
-- 16.2 RLS — tenant isolation; platform admin escape hatch via app.is_platform_admin().
-- ---------------------------------------------------------------------------
alter table tracking_event_log enable row level security;

drop policy if exists tracking_event_log_tenant_isolation on tracking_event_log;
create policy tracking_event_log_tenant_isolation
  on tracking_event_log
  using (tenant_id = app.current_tenant_id()::uuid or app.is_platform_admin())
  with check (tenant_id = app.current_tenant_id()::uuid);

-- Grants
grant select, insert on tracking_event_log to app_runtime;
-- delete/update blocked — events are append-only (audit trail integrity).