-- 26_customer_segment.down.sql — Reverse saved customer segments.
--
-- DANGER: drops a table and cannot recover data. Dev/CI only.

drop table if exists customer_segment cascade;
