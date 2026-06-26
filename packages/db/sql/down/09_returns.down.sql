-- Rollback for 09_returns.sql — drops returns tables + enums.
drop table if exists return_item cascade;
drop table if exists return_request cascade;
drop type if exists return_type cascade;
drop type if exists return_status cascade;
drop type if exists return_reason cascade;
drop type if exists refund_method cascade;