-- Migration 22 — DBID Compliance Wizard (Tier 3 P1 — regulatory moat)
-- Bangladesh DBID (Digital Business Identity) is mandatory for e-commerce.
-- Roadmap-gap §A.2: ~86% of BD sellers don't have DBID; manual submission
-- flow unblocks them, a2i/myInfo portal API integration is Phase 2.
--
-- One row per tenant. status moves: not_started → in_progress → submitted →
-- approved | rejected. We keep the full document set in JSONB so a future
-- a2i API integration can replace the manual flow without a schema change.
-- Last-4-digit hints are stored for every secret-like number (NID/TIN) to
-- keep the wizard usable without exposing the full document.
--
-- RLS: tenant_id is the join key. withTenant() enforces isolation; reads via
-- asPlatformAdmin() are allowed (for the platform compliance dashboard in a
-- later phase). No cross-tenant writes are possible without the platform-admin
-- role.

create table dbid_submission (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null unique references tenant(id) on delete cascade,

  -- The 3 documents Bangladesh DBID requires from a registered business.
  -- Each is a sealed envelope containing the doc number + any scanned file
  -- references. Stored sealed (AES-256-GCM) because they're identity docs.
  nid_sealed      jsonb,                 -- { number, last4, fileKey? }
  tin_sealed      jsonb,                 -- { number, last4, fileKey? }
  trade_license_sealed jsonb,            -- { number, last4, issuedAt, expiresAt, fileKey? }

  -- Optional BIN (Business Identification Number) for VAT-registered sellers.
  bin_sealed      jsonb,                 -- { number, last4 }

  -- Business metadata required by DBID but not secret.
  business_name   text,
  business_type   text,                  -- 'proprietorship' | 'partnership' | 'ltd'
  owner_full_name text,
  owner_dob       date,

  -- Wizard progress (drives the UI's "next step" cue).
  status          text not null default 'not_started'
                  check (status in ('not_started','in_progress','submitted','approved','rejected')),
  step            smallint not null default 1
                  check (step between 1 and 4),

  -- Optional reviewer notes (when status='rejected') + the manual DBID
  -- number once DBID approves the application.
  reviewer_notes  text,
  dbid_number     text,                  -- the actual 17-digit DBID once approved
  submitted_at    timestamptz,
  reviewed_at     timestamptz,
  expires_at      timestamptz,           -- DBID certs expire, usually 1-3 years

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Convenience index for the platform compliance dashboard (Phase 2):
-- "show me every tenant that's stuck at status='in_progress' for >7 days".
create index dbid_submission_status_idx on dbid_submission (status, submitted_at);

-- Updated_at trigger (consistency with the rest of the schema). The function
-- is defined in 01_schema.sql — it's the canonical 'touch updated_at on row
-- update' trigger used by every other tenant-owned table.
create trigger dbid_submission_set_updated_at
  before update on dbid_submission
  for each row execute function set_updated_at();

-- RLS — same shape as other tenant-owned tables. The app_runtime_login role
-- (via withTenant) gets CRUD on rows where tenant_id = current_tenant; the
-- app_admin role (via asPlatformAdmin) gets full table access for the future
-- platform compliance dashboard.
alter table dbid_submission enable row level security;
alter table dbid_submission force row level security;

-- We don't enumerate the full policy set here — the canonical policy file
-- is packages/db/sql/02_policies.sql and follows the standard pattern:
--   app_admin_all  : FOR ALL TO app_admin USING (true)
--   tenant_isolation: FOR ALL TO app_user USING (tenant_id = auth.tenant_id())
-- If a future integration needs an explicit SELECT-to-anon for the public
-- DBID badge on storefronts (we already render one for shipping zones etc.),
-- add a public_view policy gated on status='approved'.
-- GRANT + RLS policy (FIX): this migration (22) runs AFTER 02_policies.sql's
-- one-time "grant on all tables in schema public to app_runtime", so a table
-- created here was never covered — every sibling feature file (06,09..15) ships
-- its own grant+policy. Without these, asPlatformAdmin (app_runtime_login) hits
-- "permission denied for table dbid_submission" (the table forces RLS). Mirror
-- the standard tenant-owned-table pattern exactly.
grant select, insert, update, delete on dbid_submission to app_runtime;

create policy dbid_submission_isolation on dbid_submission
  for all using ((tenant_id = app.current_tenant_id()) or app.is_platform_admin());
