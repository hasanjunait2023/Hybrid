-- Migration 42 — In-store pickup (O24).
--
-- Why now: customers can optionally pick up their order from the store instead
-- of home delivery. The merchant configures pickup location(s) in tenant.settings.
--
-- Both fields are OPTIONAL — delivery orders proceed as normal.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'fulfillment_method') then
    create type fulfillment_method as enum ('delivery', 'pickup');
  end if;
end $$;

alter table orders
  add column if not exists fulfillment_method fulfillment_method not null default 'delivery',
  add column if not exists pickup_location text;

comment on column orders.fulfillment_method is 'How the customer receives the order: delivery (courier) or pickup (in-store).';
comment on column orders.pickup_location is 'Store name / address for pickup (set when fulfillment_method = pickup).';
