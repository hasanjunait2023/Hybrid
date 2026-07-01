-- Migration: 44_fix_auth_users_fk.sql
--
-- PURPOSE: Repoint FK columns that wrongly reference auth.users(id) to the
-- canonical app_user(id) table. The codebase moved off Supabase Auth in
-- 06_own_auth.sql — app_user is the only authoritative user table — but a few
-- later migrations (28_sla, 29_manual_refund) originally referenced auth.users.
--
-- AFFECTED COLUMNS:
--   orders.sla_overridden_by          (28_sla.sql)
--   sla_alert_log.recipient_user_id   (28_sla.sql)
--   return_request.initiated_by       (29_manual_refund.sql)
--
-- AUDIT TRAIL: see docs/audit/APIS_DBSCHEMA_AUDIT.md §Gaps A, B, C.
--
-- NOTE: 28_sla.sql and 29_manual_refund.sql were subsequently fixed to
-- reference app_user(id) directly with the canonical constraint names below.
-- This file is now idempotent for both old (production DBs where the
-- auth.users FK was created) and fresh (CI) installs where the named
-- constraint already exists pointing to app_user(id).

-- ----------- ORDERS.sla_overridden_by ----------------------------------------
do $$
declare
  v_conname text;
begin
  -- Drop the old auth.users FK if it still exists (production DBs created before
  -- 28_sla.sql was fixed).
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

  -- Add the correct FK only if not already present (fresh installs from the
  -- fixed 28_sla.sql already have this constraint with the canonical name).
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.orders'::regclass
       and conname = 'orders_sla_overridden_by_fk'
  ) then
    alter table public.orders
      add constraint orders_sla_overridden_by_fk
      foreign key (sla_overridden_by) references public.app_user(id)
      on delete set null;
  end if;
end $$;

-- ----------- sla_alert_log.recipient_user_id ---------------------------------
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

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.sla_alert_log'::regclass
       and conname = 'sla_alert_log_recipient_user_id_fk'
  ) then
    alter table public.sla_alert_log
      add constraint sla_alert_log_recipient_user_id_fk
      foreign key (recipient_user_id) references public.app_user(id)
      on delete set null;
  end if;
end $$;

-- ----------- return_request.initiated_by -------------------------------------
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

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.return_request'::regclass
       and conname = 'return_request_initiated_by_fk'
  ) then
    alter table public.return_request
      add constraint return_request_initiated_by_fk
      foreign key (initiated_by) references public.app_user(id)
      on delete set null;
  end if;
end $$;
