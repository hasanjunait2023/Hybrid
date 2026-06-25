-- ============================================================================
-- 12_reviews.sql — Product reviews & ratings (tenant roadmap P3-1). Additive.
-- Same isolation contract as 02_policies.sql §2 (RLS enabled+FORCED, policy
-- keyed on app.current_tenant_id()). Idempotent; runs once after 11.
--
-- Reviews build COD buyer trust. Customers submit on a delivered order; the
-- seller moderates; the storefront shows approved reviews + the average rating.
-- ============================================================================

create table if not exists product_review (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  product_id    uuid not null references product(id) on delete cascade,
  order_id      uuid references orders(id) on delete set null,
  customer_id   uuid references customer(id) on delete set null,
  customer_name text,                                   -- snapshot
  rating        integer not null check (rating between 1 and 5),
  body          text,
  status        text not null default 'pending',        -- 'pending' | 'approved' | 'rejected'
  created_at    timestamptz not null default now(),
  moderated_at  timestamptz
);
create index if not exists product_review_tenant_status_idx
  on product_review (tenant_id, status);
create index if not exists product_review_product_idx
  on product_review (tenant_id, product_id, status);

do $$
begin
  execute 'alter table product_review enable row level security';
  execute 'alter table product_review force row level security';
  if not exists (select 1 from pg_policies where tablename = 'product_review' and policyname = 'product_review_isolation') then
    create policy product_review_isolation on product_review
      using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
      with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
  end if;
end $$;

grant select, insert, update, delete on product_review to app_runtime;
