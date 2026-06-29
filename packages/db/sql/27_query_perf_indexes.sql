-- Query-specific performance indexes (hot-path lookups identified by audit).
-- Complements the RLS gap-filling in 08_perf_indexes.sql with composite
-- indexes optimised for the application's most frequent query shapes.
--
-- Without CONCURRENTLY: migrate.ts wraps each file in a transaction
-- (adminSql.begin). On a live production table with millions of rows, run
-- these by hand outside a transaction:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS <name> ON <table> ...;

-- Customer lookup by email (settings page, duplicate detection, search)
create index if not exists customer_email_tenant_idx
  on customer (tenant_id, email)
  where email is not null;

-- Order lookup by customer phone (storefront order-status page, admin search)
create index if not exists orders_customer_phone_tenant_idx
  on orders (tenant_id, customer_phone);

-- Product detail page by slug (storefront /_sites/[tenant]/products/[slug])
create index if not exists product_slug_tenant_idx
  on product (tenant_id, slug);

-- Tenant resolution by slug (middleware hot path: resolveTenantByHost fallback)
create index if not exists tenant_slug_active_idx
  on tenant (slug)
  where status in ('active', 'trial', 'past_due');

-- Marketplace listing visibility filter (catalog browse, listing sync)
create index if not exists marketplace_listing_tenant_visible_idx
  on marketplace_listing (tenant_id, visible);

-- Shipment status filter per tenant (courier-sync enumeration + admin list)
create index if not exists shipment_tenant_status_idx
  on shipment (tenant_id, status)
  where status not in ('delivered', 'returned', 'cancelled');
