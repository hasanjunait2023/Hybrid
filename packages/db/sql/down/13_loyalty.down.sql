-- Rollback for 13_loyalty.sql — drops loyalty tables + enums.
drop table if exists loyalty_ledger cascade;
drop table if exists loyalty_program cascade;