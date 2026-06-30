-- ============================================================================
-- 29_manual_refund.sql — Manual refund flow (sprint 1, O22)
-- Additive, idempotent; runs after 28.
--
-- BD context: merchants regularly need to refund customers outside the formal
-- return/RMA flow — "customer got damaged product, give ৳200 back via bKash"
-- or "I overcharged, return shipping fee" or "goodwill refund for late
-- delivery." Today's only path is the customer-initiated return flow, which
-- needs an RMA, a courier pickup, and inventory restock — overkill for a
-- simple merchant-initiated refund.
--
-- This migration extends return_type to include 'manual_refund' and adds
-- payout tracking (where the money went — bKash/Nagad transaction id, cash
-- receipt, etc.). The merchant UI is shipped separately (O22 manual-refund UI).
--
-- Tenant-scoped via the standard `app.current_tenant_id()` RLS — already used
-- by 09_returns.sql, so this follows the same pattern.
-- ============================================================================

-- ---- extend return_type enum ----------------------------------------------
-- Postgres requires enum values to be added outside any transaction block.
-- ALTER TYPE ... ADD VALUE cannot run inside a BEGIN/COMMIT block, so we use
-- the IF NOT EXISTS guard to make this idempotent on re-runs.
alter type return_type add value if not exists 'manual_refund';

-- ---- payout tracking ------------------------------------------------------
-- payout_reference: bKash trx_id / Nagad trx_id / cash receipt #
-- payout_at:       when the money actually went out (may differ from
--                   created_at if merchant queues the refund)
-- initiated_by:    which user issued the refund (for audit trail; nullable
--                   so legacy rows stay valid)
alter table return_request
  add column if not exists payout_reference text,
  add column if not exists payout_at        timestamptz,
  add column if not exists initiated_by     uuid references auth.users(id) on delete set null;

-- ---- index for refund history queries -------------------------------------
-- "Show me all refunds for this order, newest first" — common admin query.
-- Partial on type='manual_refund' to keep it small.
create index if not exists return_request_refund_idx
  on return_request (tenant_id, order_id, created_at desc)
  where type = 'manual_refund';