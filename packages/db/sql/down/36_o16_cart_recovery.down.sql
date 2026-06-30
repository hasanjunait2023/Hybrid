-- Down migration for 36_o16_cart_recovery.sql
alter table cart drop column if exists last_reminder_at;
alter table cart drop column if exists recovery_attempts;
alter table tenant drop column if exists sms_cart_recovery_enabled;
alter table tenant drop column if exists sms_cart_recovery_hours;

drop index if exists cart_recovery_pending_idx;
