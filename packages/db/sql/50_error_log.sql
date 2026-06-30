-- Migration: 50_error_log.sql
--
-- PURPOSE: Create the error_log table used by lib/errors/logger.ts for
-- structured error capture. This replaces ad-hoc console.error() calls
-- with a queryable, rate-limited, auto-pruned error store that the
-- platform dashboard can surface.
--
-- Design:
--   - Platform-scoped (no tenant_id RLS — errors are ops-facing)
--   - Auto-pruned: rows older than 30 days are dropped on insert
--   - Indexed on (module, occurred_at) for dashboard queries
--   - Indexed on (level, occurred_at) for severity-filtered views
--   - Indexed on (tenant_id, occurred_at) for tenant-scoped error views

create table if not exists error_log (
  id            uuid primary key default gen_random_uuid(),
  module        text not null,
  message       text not null,
  stack         text not null default '',
  tenant_id     uuid,                          -- nullable: platform errors have no tenant
  request_id    text,                          -- nullable: correlation id for request tracing
  level         text not null default 'error'
                  check (level in ('error', 'warn', 'info')),
  occurred_at   timestamptz not null default now()
);

-- Dashboard queries: "show me recent errors in module X"
create index if not exists error_log_module_time_idx
  on error_log (module, occurred_at desc);

-- Dashboard queries: "show me recent errors by severity"
create index if not exists error_log_level_time_idx
  on error_log (level, occurred_at desc);

-- Support queries: "show me errors for tenant X"
create index if not exists error_log_tenant_time_idx
  on error_log (tenant_id, occurred_at desc)
  where tenant_id is not null;
