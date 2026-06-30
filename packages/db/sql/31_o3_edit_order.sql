-- ============================================================================
-- 31_o3_edit_order.sql — O3 Edit Order (qty/price with full audit trail)
-- Additive, idempotent; runs after 30.
--
-- BD context: merchants regularly need to fix a typo on a freshly-placed order
-- (wrong quantity, wrong unit price, missed discount, post-purchase price
-- negotiation) BEFORE it ships. Without a "soft edit" path, the merchant
-- either (a) cancels the order and re-creates it from scratch (which loses
-- the order number, breaks the customer's mental model, and creates bKash
-- reconciliation headaches) or (b) ships the wrong item, causing a formal
-- return/RMA flow that the merchant has to physically collect.
--
-- This migration adds:
--   1. `order_edits` — append-only audit log of every merchant edit. Stores
--      BEFORE/AFTER JSONB snapshots of the touched line items + the order
--      totals so we can answer "what did this order look like before merchant
--      X changed it on date Y?" without reconstructing from history. UNIQUE
--      on (order_id, edit_seq) gives each edit a stable per-order sequence.
--   2. `order_item.edit_of` — a soft pointer from a current line item to the
--      original snapshot, so the audit trail can be linked either way. NULL
--      for legacy rows.
--   3. `audit_action` enum extension — add 'order.update' so edits get a
--      first-class audit action alongside 'order.refund' / 'order.cancel'.
--
-- The mutation itself (qty/price/discount recompute) lives in
-- apps/web/lib/orders/editOrder.ts and runs inside a withTenant txn with
-- SELECT ... FOR UPDATE on the order row. RLS keeps it tenant-scoped.
-- ============================================================================

-- ---- extend audit_action enum ---------------------------------------------
-- Postgres cannot add an enum value inside a transaction block. ALTER TYPE
-- ... ADD VALUE is idempotent via IF NOT EXISTS, so re-runs are safe.
alter type audit_action add value if not exists 'order.update';

-- ---- order_edits audit log -------------------------------------------------
-- Append-only. The merchant UI shows the most recent N rows; the migration
-- is a defense-in-depth trail in case the audit_log row is ever lost.
-- edit_seq is per-order monotonic (1, 2, 3, ...) so the history reads as a
-- timeline without needing to sort by occurred_at (which could have the same
-- second-resolution tie if a merchant clicks Save twice quickly).
create table if not exists order_edits (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  order_id    uuid not null references orders(id) on delete cascade,
  edit_seq    integer not null,                          -- per-order monotonic
  -- JSONB snapshots. before + after mirror the SAME shape: a map of
  -- order_item.id (uuid) → { quantity, unit_price, line_total } for every
  -- line item that was touched. Whole-item removes / adds are also encoded
  -- here (presence/absence in the map).
  before      jsonb not null default '{}'::jsonb,
  after       jsonb not null default '{}'::jsonb,
  -- Why the edit was made. Required so the audit story is self-explanatory
  -- for compliance / customer dispute reviews.
  reason      text not null,
  -- Who did it. Nullable so legacy rows (before this column existed) stay
  -- valid, but every editOrder() call MUST pass a non-null actor.
  actor_user_id uuid references app_user(id) on delete set null,
  occurred_at timestamptz not null default now(),
  -- Per-order edit sequence. The trigger / app code picks the next seq under
  -- the order-row lock, so the UNIQUE is enforced without serialising every
  -- edit behind a global sequence.
  unique (order_id, edit_seq)
);

create index if not exists order_edits_order_idx
  on order_edits (tenant_id, order_id, edit_seq desc);

create index if not exists order_edits_actor_idx
  on order_edits (tenant_id, actor_user_id, occurred_at desc)
  where actor_user_id is not null;

-- ---- order_item.edit_of pointer -------------------------------------------
-- After an edit, a line item can be soft-linked back to the original. We do
-- NOT use a "versioned" table (orders_v1, orders_v2) because the orders +
-- order_item tables are referenced by 20+ other tables (payment, shipment,
-- return_request, auto_cancel_log, …); a versions table would force every
-- FK to follow the chain. The pointer is informational only.
alter table order_item
  add column if not exists edit_of uuid references order_item(id) on delete set null;

-- ---- RLS -------------------------------------------------------------------
-- Tenant-scoped reads; writes go through withTenant txn (the calling role is
-- the app_runtime_login which carries tenant RLS automatically). The
-- do $$ block mirrors the pattern from 17_audit_log.sql / 30_auto_cancel.sql.
do $$
begin
  execute 'alter table order_edits enable row level security';
  execute 'alter table order_edits force row level security';
  if not exists (
    select 1 from pg_policies where tablename = 'order_edits' and policyname = 'order_edits_isolation'
  ) then
    create policy order_edits_isolation on order_edits
      for all using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
      with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
  end if;
end $$;

grant select, insert on order_edits to app_runtime;
-- No UPDATE / DELETE grants — append-only. Edits themselves live on the
-- order_item + orders rows; this table is the audit trail.
