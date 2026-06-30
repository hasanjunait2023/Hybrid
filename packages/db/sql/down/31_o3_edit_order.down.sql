-- ============================================================================
-- 31_o3_edit_order.down.sql — Rollback for 31_o3_edit_order.sql
--
-- Reverses the additive changes:
--   * drops the order_edits table (with its RLS policy + grants)
--   * drops order_item.edit_of column
--   * leaves the audit_action enum value 'order.update' in place — Postgres
--     cannot DROP an enum value used by a table, and removing it would fail
--     against any persisted audit_log row. (Same pattern as
--     29_manual_refund.down.sql keeping the 'manual_refund' value.)
-- ============================================================================

drop index if exists order_edits_actor_idx;
drop index if exists order_edits_order_idx;

drop table if exists order_edits;

alter table order_item
  drop column if exists edit_of;
