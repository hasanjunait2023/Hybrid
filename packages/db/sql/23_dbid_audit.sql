-- Migration 23 — DBID reviewer audit actions.
-- Adds two new audit_action enum values for the platform admin DBID
-- reviewer surface (S2.C5.v1). One row gets written per review decision
-- (approve/reject) so we have a full audit trail of who reviewed what,
-- when, and the resulting DBID number / rejection reason.
--
-- The reviewer surface itself (UI + actions) lives in:
--   apps/web/app/(platform)/platform/dbid/
-- The audit reads use asPlatformAdmin() so reviewers see the full
-- DBID submission queue across all tenants.

do $$ begin
  alter type audit_action add value if not exists 'dbid.review_approve';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type audit_action add value if not exists 'dbid.review_reject';
exception when duplicate_object then null;
end $$;

-- Note: PostgreSQL enum value additions cannot be wrapped in a transaction
-- (ALTER TYPE ... ADD VALUE commits immediately). The DO $$ guards above
-- make this safe to re-run.