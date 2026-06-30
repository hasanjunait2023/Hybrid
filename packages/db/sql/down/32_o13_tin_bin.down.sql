-- ============================================================================
-- 32_o13_tin_bin.down.sql — Rollback for 32_o13_tin_bin.sql
-- ============================================================================

drop index if exists tenant_tin_present_idx;
drop index if exists tenant_bin_present_idx;

alter table tenant
  drop constraint if exists tenant_tin_format,
  drop constraint if exists tenant_bin_format;

alter table tenant
  drop column if exists tin,
  drop column if exists bin;