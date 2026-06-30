-- Down migration for 37_r7_stock_alert.sql
alter table product_variant drop column if exists low_stock_threshold;
alter table product_variant drop column if exists last_low_stock_alert_at;
alter table tenant drop column if exists stock_alert_enabled;
alter table tenant drop column if exists stock_alert_default_threshold;
alter table tenant drop column if exists stock_alert_recipients;

drop index if exists product_variant_low_stock_idx;
