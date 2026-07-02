-- Migration 53 — Tracking V2 Phase D reliability (TRACK-V2-D1)
--
-- Phase D adds failed-event retry support. When a server-side platform
-- fire (Meta CAPI / GA4-MP / TikTok) returns a non-2xx or the network
-- throws, apps/web/lib/analytics/retry.ts schedules a Redis-backed
-- retry via /api/internal/tracking-retry. The DB columns here let the
-- retry sweep look up the original event, know how many attempts it
-- has had, and stamp next-retry time + a terminal flag.
--
-- All columns are nullable / defaulted so existing rows stay valid
-- (audit-grade log; no backfill, no row rewrites). The retry queue
-- itself lives in Redis (sorted set) — a DB-only queue would couple
-- retry latency to the next cron tick AND cost an extra query per
-- attempt; Redis is the natural fit.
--
-- 53.1 — tracking_event_log: retry state.
alter table tracking_event_log
  add column if not exists retry_count          int       default 0,
  add column if not exists next_retry_at        timestamptz,
  add column if not exists max_retries_reached  boolean   default false;

-- The retry sweep queries "rows due now with attempts left"; partial
-- index keeps it cheap as the log grows. (max_retries_reached=false
-- filters out dead rows so the index stays small.)
create index if not exists tracking_event_log_retry_due_idx
  on tracking_event_log(next_retry_at)
  where max_retries_reached = false;

-- 53.2 — Grants.
-- tracking_event_log was granted SELECT, INSERT to app_runtime in
-- migration 16 (audit trail: no DELETE/UPDATE). The new columns
-- inherit that grant (column-level grants are all-or-nothing per table
-- in this codebase). The retry sweep runs server-side and is the ONLY
-- writer that updates retry_count / next_retry_at / max_retries_reached
-- — it does so via asPlatformAdmin, which is BYPASSRLS and therefore
-- not subject to the app_runtime grant. No grant change needed.
