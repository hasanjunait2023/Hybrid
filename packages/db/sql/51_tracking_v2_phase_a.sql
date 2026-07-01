-- Migration 51 — Tracking V2 Phase A (TRACK-V2-A1)
--
-- Phase A adds TikTok Pixel + Events API to the per-tenant analytics
-- pipeline, plus platform-owned tracking (GA4/Meta/TikTok/Clarity) on
-- marketing/signup/platform pages. This migration only adds nullable
-- columns to tracking_event_log so the new senders can persist the same
-- dedup key the browser Pixel uses (test_event_code, external_id,
-- match_score). All columns are nullable — existing rows keep their values.
--
-- Order/customer UTM columns are deferred to Phase B (per the central spec
-- at /root/.hermes/plans/hybrid-tracking-v2/SPEC.md).
--
-- This migration is APPEND-ONLY: tracking_event_log is audit-grade; the
-- log writer in apps/web/lib/analytics/log.ts already supports the new
-- optional fields as `null` when not provided, so deploys that run the
-- app before the migration still pass (the insert goes through with the
-- new columns NULL by default in Postgres).

alter table tracking_event_log
  add column if not exists test_event_code text,
  add column if not exists external_id     text,
  add column if not exists match_score     numeric(4, 3);

-- The dedup index from migration 16 (tenant_id, event_id, platform) is the
-- one we care about for "did the event actually get counted?" — the new
-- columns are descriptive, not query drivers. No new index.

-- Grants: tracking_event_log is granted to app_runtime in migration 16;
-- the new columns inherit the same grant (column-level grants are
-- all-or-nothing per table in this codebase). No grant change needed.
