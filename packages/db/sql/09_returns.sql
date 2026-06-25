-- ============================================================================
-- 09_returns.sql — Returns / RTO / Exchange (tenant roadmap P1 #1). Additive.
--
-- Canonical 01_schema.sql / 02_policies.sql are never edited. New tenant-scoped
-- tables get the SAME isolation contract as §2 of 02_policies.sql: RLS enabled
-- + FORCED, policy keyed on app.current_tenant_id(). Idempotent so re-runs are
-- safe (migrate.ts ledger-tracks by prefix and runs this once, after 08).
--
-- BD context: COD RTO (return-to-origin) runs 20-30%; customer-initiated
-- returns/exchanges (esp. fashion size issues) need reverse courier + restock +
-- mobile-money refund. RTO is a first-class return type, distinct from a
-- customer return, both tracked here.
-- ============================================================================

-- ---- enums (guarded; Postgres 15 has no CREATE TYPE IF NOT EXISTS) ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'return_type') then
    create type return_type as enum ('return', 'exchange', 'rto');
  end if;
  if not exists (select 1 from pg_type where typname = 'return_status') then
    create type return_status as enum (
      'requested', 'approved', 'rejected', 'in_transit',
      'received', 'refunded', 'completed', 'cancelled'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'return_reason') then
    create type return_reason as enum (
      'wrong_item', 'damaged', 'size_issue', 'not_as_described',
      'customer_refused', 'rto_undelivered', 'fake_order', 'other'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'refund_method') then
    create type refund_method as enum ('bkash', 'nagad', 'cash', 'none');
  end if;
end $$;

-- ---- return_request ---------------------------------------------------------
create table if not exists return_request (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenant(id) on delete cascade,
  order_id            uuid not null references orders(id) on delete cascade,
  type                return_type   not null default 'return',
  status              return_status not null default 'requested',
  reason              return_reason not null default 'other',
  reverse_shipment_id uuid references shipment(id) on delete set null,
  refund_amount       numeric(14,2) not null default 0,
  refund_method       refund_method not null default 'none',
  refunded_at         timestamptz,
  restocked           boolean       not null default false,
  note                text,
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now(),
  resolved_at         timestamptz
);
create index if not exists return_request_tenant_status_idx
  on return_request (tenant_id, status);
create index if not exists return_request_order_idx
  on return_request (tenant_id, order_id);

-- ---- return_item — line granularity (partial returns / exchanges) -----------
create table if not exists return_item (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  return_id     uuid not null references return_request(id) on delete cascade,
  order_item_id uuid references order_item(id) on delete set null,
  variant_id    uuid references product_variant(id) on delete set null,
  title         text,
  quantity      integer not null default 1 check (quantity > 0),
  restock       boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists return_item_return_idx on return_item (tenant_id, return_id);

-- ---- RLS: identical isolation contract as 02_policies.sql §2 ----------------
do $$
declare t text;
  tbls text[] := array['return_request', 'return_item'];
begin
  foreach t in array tbls loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_isolation') then
      execute format($f$
        create policy %1$I_isolation on %1$I
          using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
          with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
      $f$, t);
    end if;
  end loop;
end $$;

grant select, insert, update, delete on return_request, return_item to app_runtime;
