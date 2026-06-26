-- Rollback for 14_platform_team.sql — drops platform member tables + enums.
drop table if exists tenant_assignment cascade;
drop table if exists platform_member cascade;
drop type if exists platform_role cascade;