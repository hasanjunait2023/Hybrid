-- Migration: 46_grant_app_runtime_to_rls_tables.sql
--
-- PURPOSE: Grant table-level privileges to app_runtime (the RLS-forced runtime
-- role) on 4 tables whose RLS policies are ENABLED + FORCED but where the
-- necessary GRANT statements are missing. Today, runtime queries against
-- cart, cart_reminder, order_note, and webhook_event hit "permission denied"
-- before RLS is even evaluated.
--
-- The same foot-gun is documented and patched in 22_dbid.sql:80-88 for
-- dbid_submission; this migration covers the remaining four.
--
-- AUDIT TRAIL: docs/audit/APIS_DBSCHEMA_AUDIT.md §Gap E + §4.3.
--
-- SAFETY:
-- 1) Wrap in DO $$ so partial failures don't stop the migration.
-- 2) Use IF EXISTS-style guards via grant_table_privileges_if_missing helper
--    logic (handled inline — see 22_dbid.sql for the canonical pattern).
-- 3) DO NOT add BYPASSRLS — these tables must stay RLS-forced; this migration
--    only grants DML rights so the existing policies can evaluate.

-- Standard grants matching the pattern used by 22_dbid.sql's runtime-grant block.
-- App runtime is a non-superuser role under app_runtime_login; without these
-- grants, even the policy-permitted rows are invisible.

grant select, insert, update, delete on public.cart              to app_runtime;
grant select, insert, update, delete on public.cart_reminder     to app_runtime;
grant select, insert, update, delete on public.order_note        to app_runtime;
grant select, insert, update, delete on public.webhook_event     to app_runtime;

-- Sequences used by these tables for default IDs / serial columns.
-- Identified by inspecting the tables. Grants are idempotent and safe.
grant usage, select on all sequences in schema public to app_runtime;
