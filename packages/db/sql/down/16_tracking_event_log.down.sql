-- Rollback for 16_tracking_event_log.sql — drops the event log table.
--
-- WARNING: this destroys all tracking_event_log rows. Only run in a
-- deployment rollback window where the admin dashboard hasn't been read
-- since the failed deploy.
--
-- Order matters:
--   1. Revoke grants (in case future roles exist)
--   2. Drop RLS policies
--   3. Drop table (CASCADE handles dependents)

revoke select, insert on tracking_event_log from app_runtime;

drop policy if exists tracking_event_log_tenant_isolation on tracking_event_log;

drop table if exists tracking_event_log cascade;