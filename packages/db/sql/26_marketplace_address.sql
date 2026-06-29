-- ============================================================================
-- 26_marketplace_address.sql — Marketplace buyer address book.
-- Additive and idempotent.
-- ============================================================================

create table if not exists marketplace_address (
  id             uuid primary key default gen_random_uuid(),
  buyer_id       uuid not null references marketplace_customer(id) on delete cascade,
  label          text,                       -- "বাড়ি", "অফিস" etc.
  recipient_name text not null,
  phone          text not null,
  division       text not null,
  district       text not null,
  thana          text not null,
  address_line   text not null,
  is_default     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists maddr_buyer_idx on marketplace_address(buyer_id);
grant select, insert, update, delete on marketplace_address to app_runtime;

alter table marketplace_address enable row level security;
alter table marketplace_address force row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
     where tablename = 'marketplace_address' and policyname = 'maddr_buyer'
  ) then
    create policy maddr_buyer on marketplace_address for all
      using  (buyer_id = app.current_buyer_id())
      with check (buyer_id = app.current_buyer_id());
  end if;
end $$;
