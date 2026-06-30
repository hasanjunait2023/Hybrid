-- ============================================================================
-- 35_o7_ndr.sql — O7 NDR (Non-Delivery Report) handling
-- Additive, idempotent; runs after 34.
--
-- What this adds:
--   * shipment.ndr_reason  — short reason tag explaining WHY the courier
--     returned the parcel without delivering (customer_refused, wrong_address,
--     phone_off, customer_unavailable, damaged_in_transit, etc.)
--   * shipment.ndr_at      — when the NDR was registered. NULL = no NDR.
--   * shipment.ndr_count   — number of NDR attempts (allows re-attempts
--     up to MAX_NDR_ATTEMPTS=3 before the seller must RTS or refund).
--
-- Why these columns and not a separate ndr_event table:
--   * A shipment in BD has at most 3 NDRs before final disposition, so
--     a join table is overkill.
--   * Keeping ndr on shipment means the courier-sync reconciler can write
--     reason + count atomically in one UPDATE (no FK round-trips).
--   * The "what happened on attempt N" detail can go in shipment.payload
--     jsonb if we ever need it for analytics.
--
-- Partial index lets the admin list page filter "NDR-pending" cheaply:
--   where ndr_count > 0 and status != 'delivered' and status != 'returned'
-- ============================================================================

alter table shipment
  add column if not exists ndr_reason text,
  add column if not exists ndr_at     timestamptz,
  add column if not exists ndr_count  integer not null default 0;

-- CHECK keeps the reason vocabulary stable. Unknown reasons go to 'other'.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shipment_ndr_reason_check'
  ) then
    alter table shipment
      add constraint shipment_ndr_reason_check
      check (ndr_reason is null or ndr_reason in (
        'customer_refused',     -- customer said no / cancelled on doorstep
        'wrong_address',        -- address didn't match / incomplete
        'phone_off',            -- phone unreachable
        'customer_unavailable', -- not home at delivery attempt
        'damaged_in_transit',   -- courier reports damage
        'cod_not_ready',        -- customer said they didn't order / won't pay
        'other'
      ));
  end if;
end $$;

create index if not exists shipment_ndr_pending_idx
  on shipment (tenant_id, ndr_at desc)
  where ndr_count > 0 and status not in ('delivered', 'returned');

-- Down migration
-- (see packages/db/sql/down/35_o7_ndr.down.sql)
