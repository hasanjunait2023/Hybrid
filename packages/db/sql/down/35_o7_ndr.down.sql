-- Down migration for 35_o7_ndr.sql
alter table shipment
  drop column if exists ndr_reason,
  drop column if exists ndr_at,
  drop column if exists ndr_count;

drop index if exists shipment_ndr_pending_idx;
