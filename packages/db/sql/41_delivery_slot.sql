-- Migration 41 — Delivery date + time slot on orders.
--
-- Why now: O10 (delivery slot). Customers can optionally pick a preferred
-- delivery date and time window at checkout. The admin sees it on the order
-- detail page and can use it for courier scheduling.
--
-- Both fields are OPTIONAL — COD orders without a slot proceed as normal.
-- The time slot is a free-text string so the merchant can define their own
-- windows (e.g. "10:00-13:00", "14:00-17:00", "Evening") without a fixed enum.

alter table orders
  add column if not exists delivery_date date,
  add column if not exists delivery_time_slot text;

comment on column orders.delivery_date is 'Preferred delivery date (optional, set by customer at checkout).';
comment on column orders.delivery_time_slot is 'Preferred time window, e.g. "10:00-13:00" (optional, free-text).';
