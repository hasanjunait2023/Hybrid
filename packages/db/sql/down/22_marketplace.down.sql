-- Rollback for 22_marketplace.sql — drops the marketplace base layer.
-- Reverse dependency order: child tables first, then additive columns, then the
-- buyer GUC helper. `cascade` removes the per-table policies with the tables.

drop table if exists marketplace_commission cascade;
drop table if exists marketplace_review cascade;
drop table if exists marketplace_suborder cascade;
drop table if exists marketplace_order cascade;
drop table if exists marketplace_session cascade;
drop table if exists marketplace_customer cascade;
drop table if exists marketplace_listing_variant cascade;
drop table if exists marketplace_listing cascade;
drop table if exists marketplace_category cascade;
drop table if exists marketplace_config cascade;

alter table orders drop column if exists marketplace_order_id;
alter table orders drop column if exists channel;
alter table product drop column if exists marketplace_hidden;

drop function if exists app.current_buyer_id();
