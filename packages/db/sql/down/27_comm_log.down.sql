-- 27_comm_log.down.sql — Reverse comm log additions.
-- DANGER: drops tables and cannot recover data. Dev/CI only.

drop table if exists sms_log cascade;
drop table if exists email_log cascade;