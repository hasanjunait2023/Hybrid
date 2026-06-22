-- ============================================================================
-- Hybrid — 04_grant_login.sql  (runs LAST, after 02_policies.sql)
-- ----------------------------------------------------------------------------
-- Completes the NOLOGIN fix. 02_policies.sql has now created the `app_runtime`
-- group role and granted it the table/sequence/function privileges. We make the
-- LOGIN role (created in 00_roles.sql) a member so it inherits all of them.
--
-- Idempotent: GRANT ... TO is a no-op if membership already exists.
-- ============================================================================

grant app_runtime to app_runtime_login;
