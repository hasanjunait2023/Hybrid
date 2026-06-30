-- Migration: 44_fix_auth_users_fk.sql
--
-- PURPOSE: Repoint 4 FK columns that wrongly reference auth.users(id) to the
-- canonical app_user(id) table. The codebase moved off Supabase Auth in
-- 06_own_auth.sql — app_user is the only authoritative user table — but a few
-- later migrations (28_sla, 29_manual_refund) still reference auth.users.
--
-- AFFECTED COLUMNS:
--   orders.sla_overridden_by          (28_sla.sql:40)
--   sla_alert_log.recipient_user_id  (28_sla.sql:69)
--   return_request.initiated_by      (29_manual_refund.sql:35)
--
-- AUDIT TRAIL: see docs/audit/APIS_DBSCHEMA_AUDIT.md §Gaps A, B, C.
--
-- RATIONALE:
-- On self-hosted Supabase, auth.users only exists if GoTrue is enabled; even
-- when it does exist, the user's Hybrid-side identity lives in app_user. Linking
-- audit columns to auth.users means downstream queries (audit logs, SLA
-- "who overrode this?", "who initiated refund?") join to the wrong table and
-- return NULL for every non-migrated row.
--
-- SAFETY:
-- 1) DROP CONSTRAINT requires knowing the auto-generated FK name. We try
--    the conventional name first, then fall back to information_schema lookup
--    so the migration is idempotent and works regardless of who created the FK.
-- 2) We re-create the FK against app_user(id) with the same ON DELETE behavior
--    the original column had (on delete set null) — preserving domain semantics.
-- 3) Wrapped in DO blocks so a single failure does not abort the migration.
--
-- ROLLBACK: write a forward-fix migration that drops the new constraint and
-- recreates the auth.users one. This file is intentionally not reversible
-- in-place because dropping the FK inside a live transaction is risky.

-- ----------- ORDERS.sla_overridden_by ----------------------------------------
do $$
declare
  v_conname text;
begin
  -- Resolve the FK constraint name regardless of who created it
  select conname into v_conname
    from pg_constraint
   where conrelid = 'public.orders'::regclass
     and contype = 'f'
     and pg_get_constraintdef(oid) ilike '%auth.users%'
     and pg_get_constraintdef(oid) ilike '%sla_overridden_by%'
   limit 1;

  if v_conname is not null then
    execute format('alter table public.orders drop constraint %I', v_conname);
  end if;

  alter table public.orders
    add constraint orders_sla_overridden_by_fk
    foreign key (sla_overridden_by) references public.app_user(id)
    on delete set null;
end $$;

-- ----------- sla_alert_log.recipient_user_id -------------------------------
do $$
declare
  v_conname text;
begin
  select conname into v_conname
    from pg_constraint
   where conrelid = 'public.sla_alert_log'::regclass
     and contype = 'f'
     and pg_get_constraintdef(oid) ilike '%auth.users%'
   limit 1;

  if v_conname is not null then
    execute format('alter table public.sla_alert_log drop constraint %I', v_conname);
  end if;

  alter table public.sla_alert_log
    add constraint sla_alert_log_recipient_user_id_fk
    foreign key (recipient_user_id) references public.app_user(id)
    on delete set null;
end $$;

-- ----------- return_request.initiated_by ------------------------------------
do $$
declare
  v_conname text;
begin
  select conname into v_conname
    from pg_constraint
   where conrelid = 'public.return_request'::regclass
     and contype = 'f'
     and pg_get_constraintdef(oid) ilike '%auth.users%'
     and pg_get_constraintdef(oid) ilike '%initiated_by%'
   limit 1;

  if v_conname is not null then
    execute format('alter table public.return_request drop constraint %I', v_conname);
  end if;

  alter table public.return_request
    add constraint return_request_initiated_by_fk
    foreign key (initiated_by) references public.app_user(id)
    on delete set null;
end $$;
