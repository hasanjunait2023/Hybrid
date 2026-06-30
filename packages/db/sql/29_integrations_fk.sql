-- ============================================================================
-- 29_integrations_fk.sql — Add missing FK constraints on tenant_id columns
--
-- external_entity_map and sync_log were created in 28_integrations.sql with
-- tenant_id columns but without foreign key constraints referencing tenant(id).
-- This migration adds those constraints idempotently.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name   = 'external_entity_map'
      and constraint_name = 'external_entity_map_tenant_id_fkey'
  ) then
    alter table external_entity_map
      add constraint external_entity_map_tenant_id_fkey
      foreign key (tenant_id) references tenant(id) on delete cascade;
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name   = 'sync_log'
      and constraint_name = 'sync_log_tenant_id_fkey'
  ) then
    alter table sync_log
      add constraint sync_log_tenant_id_fkey
      foreign key (tenant_id) references tenant(id) on delete cascade;
  end if;
end $$;
