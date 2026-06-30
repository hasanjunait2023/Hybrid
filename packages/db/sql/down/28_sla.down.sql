-- Reverse migration 28. Drops sla_alert_log, removes SLA columns from orders.
-- Run only if rolling back 28_sla.sql.

drop table if exists sla_alert_log;

alter table orders
  drop column if exists sla_zone,
  drop column if exists sla_handover_deadline_at,
  drop column if exists sla_delivery_deadline_at,
  drop column if exists sla_refund_window_closes_at,
  drop column if exists sla_overridden_by,
  drop column if exists sla_overridden_reason;