-- 25_marketplace_fee.down.sql — Reverse the wholesale monthly-fee additions.
--
-- DANGER: drops a table + column and cannot recover data. Dev/CI only.

drop table if exists marketplace_fee cascade;
alter table tenant drop column if exists marketplace_monthly_fee;
