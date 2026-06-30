-- ============================================================================
-- 29_manual_refund.down.sql — Rollback for 29_manual_refund.sql
--
-- Postgres cannot DROP an enum value used by a table, so we drop the index +
-- columns and leave the enum value 'manual_refund' in place. Pre-existing rows
-- with that value would fail the rollback otherwise.
-- ============================================================================

drop index if exists return_request_refund_idx;

alter table return_request
  drop column if exists payout_reference,
  drop column if exists payout_at,
  drop column if exists initiated_by;
