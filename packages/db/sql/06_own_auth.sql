-- ============================================================================
-- Hybrid — Own Auth (SHIFT 1)        |  File 06 (runs AFTER 04_grant_login.sql)
-- ----------------------------------------------------------------------------
-- Phase 2 drops Supabase Auth and owns the auth layer end-to-end:
--   * app_user gains a password_hash (Argon2id) — nullable for dev-era rows.
--   * user_session — opaque, DB-backed, revocable session tokens (SHA-256 of a
--     256-bit random token; the raw token is NEVER stored). This is what backs
--     getSession() under AUTH_PROVIDER=password.
--   * otp_code — short-lived SMS OTPs for signup/login/reset. user_id is
--     NULLABLE because at signup step 1 the OTP precedes the app_user row.
--
-- These are GLOBAL-identity tables (no tenant_id), exactly like app_user. They
-- MUST NOT join the tenant_tables isolation loop in 02_policies.sql. Auth
-- lookups run via asPlatformAdmin() (the only context that can read across users
-- before a tenant is resolved — same rationale as resolveActiveTenantId).
--
-- DOES NOT edit canonical 01_schema.sql / 02_policies.sql. Additive bookend.
--
-- GRANTS ARE REQUIRED, NOT OPTIONAL. `alter default privileges` in
-- 02_policies.sql only covers objects created by the role that ran it
-- (DIRECT_URL/postgres in 02). Tables created here, in a LATER migration, get
-- NO grant from that default-privileges clause, so a runtime (app_runtime_login)
-- query would fail with "permission denied" without the explicit grants at the
-- end of this file. This is a known footgun; the grants below close it.
-- ============================================================================

-- Drop the dead Supabase trigger function from 05_auth.sql. With Supabase Auth
-- removed, handle_new_auth_user() has no caller (on plain Postgres the guard in
-- 05 meant the trigger was never wired anyway). 05_auth.sql is also removed from
-- the migrate.ts execution list; this DROP makes 06 self-sufficient on a DB that
-- previously applied 05.
drop function if exists public.handle_new_auth_user() cascade;

-- ---------------------------------------------------------------------------
-- 1. app_user.password_hash — Argon2id digest. Nullable: dev-login / pre-Phase2
--    rows have no password; the password provider only authenticates rows that
--    DO carry a hash.
-- ---------------------------------------------------------------------------
alter table app_user add column if not exists password_hash text;

-- ---------------------------------------------------------------------------
-- 2. user_session — durable opaque session tokens.
--    token_hash = sha256(base64url(randomBytes(32))); the raw token lives only
--    in the user's HttpOnly cookie, never in the DB. Logout = set revoked_at
--    (or hard DELETE). expires_at gives a hard 7-day ceiling regardless.
-- ---------------------------------------------------------------------------
create table if not exists user_session (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_user(id) on delete cascade,
  token_hash  text not null,
  expires_at  timestamptz not null,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

-- token_hash is the hot lookup path (every authenticated request). Unique so a
-- (vanishingly unlikely) hash collision can't return two sessions.
create unique index if not exists user_session_token_hash_uniq
  on user_session (token_hash);
-- "log out all sessions for a user" + cascade scans.
create index if not exists user_session_user_id_idx
  on user_session (user_id);

-- ---------------------------------------------------------------------------
-- 3. otp_code — short-lived SMS OTPs. code_hash = sha256(6-digit code). user_id
--    is NULLABLE (signup OTP precedes the app_user row). attempts caps brute
--    force on a single code; the app also rate-limits issuance per target.
-- ---------------------------------------------------------------------------
create table if not exists otp_code (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references app_user(id) on delete cascade,   -- NULLABLE
  target      text not null,                                    -- phone (E.164) or email
  code_hash   text not null,                                    -- sha256 of the 6-digit code
  purpose     text not null,                                    -- signup | login | reset
  expires_at  timestamptz not null,                             -- now() + 5 min
  used        boolean not null default false,
  attempts    integer not null default 0,
  created_at  timestamptz not null default now()
);

-- The verify path looks up the freshest unused, unexpired code for a target +
-- purpose. This index covers that probe.
create index if not exists otp_code_target_purpose_idx
  on otp_code (target, purpose, expires_at);

-- ---------------------------------------------------------------------------
-- 4. RLS — global-identity, self-or-admin (mirrors the app_user policy in 02).
--    In practice EVERY auth read/write runs under asPlatformAdmin (otp_code has
--    no user_id pre-signup; session lookup precedes tenant resolution), so the
--    admin branch carries the load. The self branch (user_id = current_user_id)
--    is kept so a future tenant-context "manage my sessions" surface can read a
--    user's own sessions without platform-admin. otp_code is admin-gated only
--    (rows may have a NULL user_id — never expose them to tenant context).
-- ---------------------------------------------------------------------------
alter table user_session enable row level security;
alter table user_session force row level security;
create policy user_session_select on user_session for select
  using (user_id = app.current_user_id() or app.is_platform_admin());
create policy user_session_insert on user_session for insert
  with check (user_id = app.current_user_id() or app.is_platform_admin());
create policy user_session_update on user_session for update
  using (user_id = app.current_user_id() or app.is_platform_admin())
  with check (user_id = app.current_user_id() or app.is_platform_admin());
create policy user_session_delete on user_session for delete
  using (user_id = app.current_user_id() or app.is_platform_admin());

alter table otp_code enable row level security;
alter table otp_code force row level security;
-- Admin-gated all-verbs: otp rows may carry a NULL user_id (pre-signup), so
-- there is no meaningful self-scope; the verify/issue paths run as platform admin.
create policy otp_code_admin on otp_code for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 5. Grants — REQUIRED (see header). These tables were created above by the
--    DIRECT_URL/postgres role; the 02 default-privileges clause does not cover
--    them, so app_runtime (and via INHERIT, app_runtime_login) needs explicit
--    grants to run the auth queries under RLS.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on user_session to app_runtime;
grant select, insert, update, delete on otp_code     to app_runtime;
