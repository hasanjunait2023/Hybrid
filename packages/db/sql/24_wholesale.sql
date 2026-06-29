-- ============================================================================
-- 24_wholesale.sql — Wholesale / B2B channel for Hybrid. Additive.
--
-- Adds business-type distinction on tenants, B2B fields on products/variants,
-- B2B customer types, wholesale order mode, purchase requests, and a credit
-- ledger. Also extends the marketplace projection so the Bazar can list
-- wholesale products separately from retail products.
--
-- Idempotent; runs once after 22_marketplace.sql. Matches the contract of
-- 02_policies.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Enumerated types
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tenant_business_type') then
    create type tenant_business_type as enum ('retail','wholesale','both');
  end if;
  if not exists (select 1 from pg_type where typname = 'customer_type') then
    create type customer_type as enum ('end_consumer','retailer','distributor','wholesaler');
  end if;
  if not exists (select 1 from pg_type where typname = 'order_mode') then
    create type order_mode as enum ('retail','wholesale');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Tenant business type + KYC
-- ---------------------------------------------------------------------------
alter table tenant add column if not exists business_type tenant_business_type not null default 'retail';
alter table tenant add column if not exists kyc_status text not null default 'pending';
alter table tenant add column if not exists kyc_documents jsonb not null default '[]'::jsonb;
alter table tenant add column if not exists wholesale_approved boolean not null default false;
create index if not exists tenant_business_type_idx on tenant (business_type);
create index if not exists tenant_kyc_status_idx on tenant (kyc_status) where wholesale_approved = false;

-- ---------------------------------------------------------------------------
-- 2. Product / variant B2B fields
-- ---------------------------------------------------------------------------
alter table product add column if not exists is_wholesale boolean not null default false;
alter table product add column if not exists wholesale_only boolean not null default false;
alter table product add column if not exists moq integer;

alter table product_variant add column if not exists wholesale_price numeric(14,2);
alter table product_variant add column if not exists tier_prices jsonb not null default '[]'::jsonb;
alter table product_variant add column if not exists moq integer;

create index if not exists product_wholesale_idx on product (tenant_id, is_wholesale) where is_wholesale = true;

-- ---------------------------------------------------------------------------
-- 3. Customer B2B fields (tenant-scoped seller customer list)
-- ---------------------------------------------------------------------------
alter table customer add column if not exists customer_type customer_type not null default 'end_consumer';
alter table customer add column if not exists business_name text;
alter table customer add column if not exists trade_license_no text;
alter table customer add column if not exists bin_no text;
alter table customer add column if not exists credit_limit numeric(14,2) not null default 0;
alter table customer add column if not exists current_due numeric(14,2) not null default 0;
alter table customer add column if not exists is_verified boolean not null default false;

create index if not exists customer_b2b_idx on customer (tenant_id, customer_type) where customer_type != 'end_consumer';

-- ---------------------------------------------------------------------------
-- 4. Order wholesale fields
-- ---------------------------------------------------------------------------
alter table orders add column if not exists order_mode order_mode not null default 'retail';
alter table orders add column if not exists is_purchase_order boolean not null default false;
alter table orders add column if not exists po_reference text;
alter table orders add column if not exists credit_approved boolean not null default false;
alter table orders add column if not exists credit_due numeric(14,2) not null default 0;
alter table orders add column if not exists credit_terms jsonb not null default '{}'::jsonb;

create index if not exists orders_wholesale_idx on orders (tenant_id, order_mode) where order_mode = 'wholesale';

-- ---------------------------------------------------------------------------
-- 5. Marketplace projection B2B fields
-- ---------------------------------------------------------------------------
alter table marketplace_listing add column if not exists is_wholesale boolean not null default false;
alter table marketplace_listing add column if not exists wholesale_only boolean not null default false;
alter table marketplace_listing add column if not exists moq integer;

create index if not exists ml_wholesale_idx
  on marketplace_listing (is_wholesale, wholesale_only)
  where status = 'active' and hidden = false;

alter table marketplace_listing_variant add column if not exists wholesale_price numeric(14,2);
alter table marketplace_listing_variant add column if not exists tier_prices jsonb not null default '[]'::jsonb;
alter table marketplace_listing_variant add column if not exists moq integer;

-- ---------------------------------------------------------------------------
-- 6. Marketplace buyer B2B fields
-- ---------------------------------------------------------------------------
alter table marketplace_customer add column if not exists customer_type text not null default 'end_consumer';
alter table marketplace_customer add column if not exists business_name text;
alter table marketplace_customer add column if not exists trade_license_no text;
alter table marketplace_customer add column if not exists bin_no text;
alter table marketplace_customer add column if not exists is_verified boolean not null default false;

-- ---------------------------------------------------------------------------
-- 7. Purchase request / quotation (tenant-scoped)
-- ---------------------------------------------------------------------------
create table if not exists purchase_request (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  buyer_customer_id uuid not null references customer(id) on delete cascade,
  status          text not null default 'draft', -- draft | submitted | quoted | accepted | rejected | converted
  items           jsonb not null default '[]'::jsonb,
  quoted_subtotal numeric(14,2),
  quoted_total    numeric(14,2),
  expires_at      timestamptz,
  converted_order_id uuid references orders(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists pr_tenant_status_idx on purchase_request (tenant_id, status);
create index if not exists pr_buyer_idx on purchase_request (buyer_customer_id);

-- ---------------------------------------------------------------------------
-- 8. Customer credit ledger (tenant-scoped)
-- ---------------------------------------------------------------------------
create table if not exists customer_ledger (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  customer_id   uuid not null references customer(id) on delete cascade,
  type          text not null, -- sale | payment | credit_note | debit_note
  amount        numeric(14,2) not null,
  balance       numeric(14,2) not null,
  reference_type text,
  reference_id  uuid,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists cl_customer_idx on customer_ledger (tenant_id, customer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 9. RLS + policies on new tables
-- ---------------------------------------------------------------------------
do $$
begin
  execute 'alter table purchase_request enable row level security';
  execute 'alter table purchase_request force row level security';
  if not exists (select 1 from pg_policies where tablename='purchase_request' and policyname='pr_isolation') then
    create policy pr_isolation on purchase_request
      for all using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
      with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
  end if;

  execute 'alter table customer_ledger enable row level security';
  execute 'alter table customer_ledger force row level security';
  if not exists (select 1 from pg_policies where tablename='customer_ledger' and policyname='cl_isolation') then
    create policy cl_isolation on customer_ledger
      for all using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
      with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 10. updated_at trigger on purchase_request
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'purchase_request_set_updated_at'
  ) then
    create trigger purchase_request_set_updated_at
      before update on purchase_request
      for each row execute function set_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Grants (app_runtime needs access to new columns/tables)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on purchase_request to app_runtime;
grant select, insert, update, delete on customer_ledger to app_runtime;
grant usage, select on all sequences in schema public to app_runtime;
