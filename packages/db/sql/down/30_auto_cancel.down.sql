-- 30_auto_cancel.down.sql — reverse of 30_auto_cancel.sql.
drop table if exists auto_cancel_log;
drop index if exists orders_auto_cancel_sweep_idx;
alter table orders
  drop column if exists cancel_reason,
  drop column if exists cancel_after_at;
