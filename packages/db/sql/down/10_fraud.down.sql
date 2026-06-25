-- Rollback for 10_fraud.sql — drops the fraud blocklist.
drop table if exists phone_blocklist cascade;