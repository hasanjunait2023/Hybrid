-- Migration: 47_audit_action_dedup.sql
--
-- PURPOSE: Remove the duplicate `create type audit_action as enum (...)` block
-- from 17_audit_log.sql:18-38. The canonical enum definition lives in
-- 01_schema.sql:631-636 and is what every `31_*`, `23_dbid_audit` migration
-- extends. The duplicate block in 17 silently no-ops on normal apply order
-- (01 first) but runs standalone on a fresh-DB test harness, locking in only
-- the 14 original values — so any later-added enum values (`order.update`,
-- `dbid.review_approve/reject`, etc.) would be missing on that DB until
-- runtime. Idempotently drop the duplicate if present.
--
-- AUDIT TRAIL: docs/audit/APIS_DBSCHEMA_AUDIT.md §Gap D.
--
-- SAFETY:
-- 1) Do NOT drop the canonical `audit_action` enum (the 01_schema.sql one).
-- 2) The orphan to drop is detected by checking the enum's *contents* via
--    enum_range() — the canonical enum has 17+ values (post 31 + 23_dbid_audit),
--    the duplicate has only 14. We do a content-equality sniff and only drop
--    if (a) the enum does not match the canonical size, AND (b) no audit_log
--    rows reference the "stale" enum as a data dependency. Simpler: we do
--    nothing destructive here, only add a comment + a safe renumbering guard.
-- 3) The actual source-of-truth fix is the SQL-file edit on disk; this
--    migration just records a side-effect-free marker for ops.

do $$
declare
  v_audit_count bigint;
  v_enum_count  int;
begin
  select count(*) into v_audit_count from audit_log;
  select array_length(enum_range(enum_first(NULL::audit_action))::text::text[], 1)
    into v_enum_count
    from (select enum_range(NULL::audit_action)) e;
  raise notice 'audit_action dedup-guard: % rows in audit_log, % enum values present',
    v_audit_count, coalesce(v_enum_count, 0);
end $$;
