-- Migration 22 rollback — DBID Compliance Wizard.
-- Reverse order: drop trigger, then index, then table.

drop trigger if exists dbid_submission_set_updated_at on dbid_submission;
drop index if exists dbid_submission_status_idx;
drop table if exists dbid_submission;