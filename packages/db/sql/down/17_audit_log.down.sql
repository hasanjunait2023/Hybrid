-- Rollback for 17_audit_log.sql — drops the audit log table and enum.
--
-- WARNING: destroys all audit history. Only run when rolling back the
-- P1.1 audit log feature in a failed deploy window.

revoke select on audit_log from app_runtime;
revoke usage on type audit_action from app_runtime;

drop policy if exists audit_log_tenant_read on audit_log;

drop table if exists audit_log cascade;
drop type if exists audit_action cascade;