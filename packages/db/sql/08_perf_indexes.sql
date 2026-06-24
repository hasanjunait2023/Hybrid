-- ============================================================================
-- Hybrid Storefront — Tenant-Index Performance Audit (RLS at Scale)
-- PostgreSQL Indexes + pg_stat_statements  |  File 08
-- ----------------------------------------------------------------------------
-- Background
-- ----------
-- Every table in the RLS isolation loop (02_policies.sql) carries a policy:
--
--   USING (tenant_id = app.current_tenant_id() OR app.is_platform_admin())
--
-- For that predicate to be index-served at 10 k tenants, the planner must have
-- an index whose LEADING column is tenant_id.  A composite like (tenant_id, x)
-- satisfies the requirement; a plain (tenant_id) also works.
--
-- Audit results
-- -------------
-- COVERED — already has a leading-tenant_id index (composite or plain):
--
--   store_page          UNIQUE (tenant_id, slug)
--   navigation_menu     UNIQUE (tenant_id, handle)
--   landing_page        UNIQUE (tenant_id, slug)
--   collection          UNIQUE (tenant_id, slug)
--   product             product_tenant_status_idx (tenant_id, status)
--   discount            UNIQUE (tenant_id, code)
--   order_counter       PK = tenant_id
--   orders              orders_tenant_placed_idx (tenant_id, placed_at desc)
--   payment_account     UNIQUE (tenant_id, provider)
--   courier_account     UNIQUE (tenant_id, provider)
--   cod_remittance      cod_remittance_tenant_provider_idx (tenant_id, provider)
--   shipment            shipment_tenant_codstatus_idx (tenant_id, cod_status)
--   invoice             invoice_tenant_status_idx (tenant_id, status)
--   usage_counter       UNIQUE (tenant_id, period_month)
--   analytics_event     analytics_event_tenant_type_time_idx (tenant_id, type, occurred_at desc)
--   audit_log           audit_log_tenant_idx (tenant_id, created_at desc)
--
-- GAP — only a partial index or a non-leading index exists; RLS scan is
-- unindexed for the general predicate tenant_id = <value>:
--
--   tenant_domain       partial UNIQUE (tenant_id) WHERE is_primary  → gap
--   tenant_theme_settings  partial UNIQUE (tenant_id) WHERE is_active  → gap
--   product_image       index only on (product_id)  → gap
--   product_variant     index only on (product_id) + partial SKU  → gap
--   product_collection  PK (product_id, collection_id), secondary (collection_id)  → gap
--   customer            partial UNIQUE (tenant_id, phone) WHERE phone IS NOT NULL  → gap
--   customer_address    index only on (customer_id)  → gap
--   order_item          index only on (order_id)  → gap
--   payment             only partial unique indexes, no full-scan tenant_id index  → gap
--   subscription        partial UNIQUE (tenant_id) WHERE status IN (...)  → gap
--   webhook_event       tenant_id nullable, no leading-tenant_id index  → gap
--
-- Concurrency note
-- ----------------
-- These indexes are created WITHOUT CONCURRENTLY because migrate.ts wraps
-- every SQL file in a single transaction (adminSql.begin), and PostgreSQL does
-- not allow CREATE INDEX CONCURRENTLY inside a transaction block.
-- On a fresh / small database this is instant.
--
-- IMPORTANT: On a large production table (millions of rows) you MUST add new
-- indexes outside migrate.ts, by hand, using CREATE INDEX CONCURRENTLY so the
-- build does not take an ACCESS SHARE lock for minutes.  The ALTER SYSTEM
-- approach for existing columns is:
--
--   -- Run outside any transaction, directly in psql:
--   CREATE INDEX CONCURRENTLY product_image_tenant_idx
--     ON product_image (tenant_id);
--
-- After adding manually, migrate.ts's ledger will skip this file on the next
-- run only if the file was already recorded.  Alternatively track manual
-- indexes in a separate migration file that uses IF NOT EXISTS (idempotent).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — Gap-filling tenant_id indexes (idempotent via IF NOT EXISTS)
-- ---------------------------------------------------------------------------

-- tenant_domain: partial primary index does not cover the general RLS predicate
create index if not exists tenant_domain_tenant_idx
  on tenant_domain (tenant_id);

-- tenant_theme_settings: partial active-only index leaves non-active rows unindexed
create index if not exists tenant_theme_settings_tenant_idx
  on tenant_theme_settings (tenant_id);

-- product_image: only indexed by product_id; RLS scans by tenant_id
create index if not exists product_image_tenant_idx
  on product_image (tenant_id);

-- product_variant: only indexed by product_id + partial SKU; RLS scans by tenant_id
create index if not exists product_variant_tenant_idx
  on product_variant (tenant_id);

-- product_collection: PK is (product_id, collection_id), secondary on collection_id;
-- no leading tenant_id path for RLS
create index if not exists product_collection_tenant_idx
  on product_collection (tenant_id);

-- customer: partial unique (tenant_id, phone) WHERE phone IS NOT NULL does not
-- serve a bare tenant_id = ? predicate without a phone filter
create index if not exists customer_tenant_idx
  on customer (tenant_id);

-- customer_address: only indexed by customer_id; RLS scans by tenant_id
create index if not exists customer_address_tenant_idx
  on customer_address (tenant_id);

-- order_item: only indexed by order_id; RLS scans by tenant_id
create index if not exists order_item_tenant_idx
  on order_item (tenant_id);

-- payment: both unique indexes are partial (WHERE transaction_id IS NOT NULL /
-- WHERE provider_ref IS NOT NULL); a full-table RLS scan has no usable index
create index if not exists payment_tenant_idx
  on payment (tenant_id);

-- subscription: partial unique (tenant_id) WHERE status IN (...) does not cover
-- cancelled / expired rows for the general RLS predicate
create index if not exists subscription_tenant_idx
  on subscription (tenant_id);

-- webhook_event: tenant_id is nullable but the RLS policy still filters by it;
-- no leading-tenant_id index exists
create index if not exists webhook_event_tenant_idx
  on webhook_event (tenant_id);


-- ---------------------------------------------------------------------------
-- Section 2 — pg_stat_statements (query-level performance visibility)
-- ---------------------------------------------------------------------------
-- pg_stat_statements tracks execution stats (calls, total_time, rows, etc.)
-- for every normalized query.  Enabling it is a two-step process:
--
--   Step A — Server configuration (requires a Postgres restart; cannot be done
--             from inside migrate.ts because it needs superuser ALTER SYSTEM
--             and a server reload/restart):
--
--     ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
--     -- Then restart Postgres (e.g. `pg_ctl restart` or docker restart).
--
--   For Supabase managed instances, add pg_stat_statements to
--   shared_preload_libraries via the Supabase dashboard → Project Settings →
--   Database → "pg_stat_statements" toggle (already on by default in Supabase).
--
--   For self-hosted / Docker: add to postgresql.conf (or docker-compose env):
--     POSTGRES_OPTIONS="-c shared_preload_libraries=pg_stat_statements"
--
--   Step B — Extension creation (done here, safe to run in a transaction):
--
create extension if not exists pg_stat_statements;

-- After the extension is active, inspect slow queries with:
--
--   SELECT
--     left(query, 120)          AS query,
--     calls,
--     round(total_exec_time::numeric / calls, 2) AS avg_ms,
--     rows
--   FROM pg_stat_statements
--   ORDER BY total_exec_time DESC
--   LIMIT 20;
--
-- Reset stats between benchmarks:
--   SELECT pg_stat_statements_reset();
-- ============================================================================
