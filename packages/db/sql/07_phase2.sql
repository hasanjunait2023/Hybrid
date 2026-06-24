-- ============================================================================
-- 07_phase2.sql — Phase 2 (M3) feature columns. Additive ALTERs ONLY.
--
-- Canonical 01_schema.sql / 02_policies.sql are never edited; Phase-2 DDL ships
-- as new migration files (06+). migrate.ts picks files by lexical prefix and
-- skips 03_ (seed), so 07 runs after 06 (own auth) automatically.
--
-- 2.6 COD reconciliation engine — the batch-state columns the engine needs.
-- cod_remittance is ALREADY a tenant-scoped table inside the isolation loop in
-- 02_policies.sql (RLS enabled + FORCED, policy keyed on app.current_tenant_id()).
-- New columns inherit that policy automatically — no new policy, no new grant
-- (the schema-wide grant on the existing table already covers added columns).
-- ============================================================================

-- status:          pending  -> a batch row exists, matching not yet run
--                  processed-> matching completed (rows matched/unmatched counted)
--                  failed   -> parse/ingest aborted before any shipment write
-- processed_at:    when matching completed (null until processed)
-- unmatched_count: CSV lines that matched no shipment (manual-review signal;
--                  unmatched lines are COUNTED, never silently dropped — fail-open
--                  reporting per the brief §2.6 step 5).
alter table cod_remittance
  add column if not exists status          text        not null default 'pending',
  add column if not exists processed_at    timestamptz,
  add column if not exists unmatched_count integer     not null default 0;

-- Constrain status to the three known batch states (defensive; the engine only
-- ever writes these). A CHECK is not a new policy — RLS isolation is untouched.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cod_remittance_status_chk'
  ) then
    alter table cod_remittance
      add constraint cod_remittance_status_chk
      check (status in ('pending', 'processed', 'failed'));
  end if;
end $$;
