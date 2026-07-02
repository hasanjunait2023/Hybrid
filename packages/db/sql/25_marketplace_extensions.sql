-- ============================================================================
-- 25_marketplace_extensions.sql — Marketplace: wishlist + payment method hook.
-- Additive and idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Wishlist (buyer-owned, RLS-guarded)
-- ---------------------------------------------------------------------------
create table if not exists marketplace_wishlist (
  id          uuid primary key default gen_random_uuid(),
  buyer_id    uuid not null references marketplace_customer(id) on delete cascade,
  product_id  uuid not null references product(id) on delete cascade,
  listing_id  uuid not null references marketplace_listing(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (buyer_id, product_id)
);
create index if not exists mwl_buyer_idx on marketplace_wishlist (buyer_id, created_at desc);
grant select, insert, delete on marketplace_wishlist to app_runtime;

alter table marketplace_wishlist enable row level security;
alter table marketplace_wishlist force row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
     where tablename = 'marketplace_wishlist' and policyname = 'mwl_buyer'
  ) then
    create policy mwl_buyer on marketplace_wishlist for all
      using  (buyer_id = app.current_buyer_id())
      with check (buyer_id = app.current_buyer_id());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Payment method hook on marketplace_order
--    payment_method: 'cod' | 'online' (default cod; payment agent sets online)
--    payment_intent: bKash trxID / SSLCommerz ref / HybridPay ref
-- ---------------------------------------------------------------------------
alter table marketplace_order add column if not exists payment_method text not null default 'cod';
alter table marketplace_order add column if not exists payment_intent text;
