-- Migration 43 — Preorder (R8).
--
-- Why now: customers can preorder products that are not yet in stock. The
-- merchant enables preorder per product, sets an expected availability date,
-- and optionally caps the number of preorders.
--
-- When preorder is enabled and stock = 0, the add-to-cart button shows
-- "Preorder" instead of "Out of stock". placeOrder skips the stock decrement
-- for preorder items.

begin;

alter table product
  add column if not exists preorder_enabled      boolean not null default false,
  add column if not exists preorder_available_at timestamptz,
  add column if not exists preorder_max          integer;

comment on column product.preorder_enabled is 'Allow customers to preorder this product when stock is 0.';
comment on column product.preorder_available_at is 'Expected availability date for preorder customers.';
comment on column product.preorder_max is 'Maximum number of preorders allowed (null = unlimited).';

commit;
