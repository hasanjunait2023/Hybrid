-- 24_wholesale.down.sql — Reverse wholesale/B2B additions safely.
--
-- DANGER: this drops columns/tables and cannot recover data. Only run in dev/CI.

alter table tenant drop column if exists business_type;
alter table tenant drop column if exists kyc_status;
alter table tenant drop column if exists kyc_documents;
alter table tenant drop column if exists wholesale_approved;

alter table product drop column if exists is_wholesale;
alter table product drop column if exists wholesale_only;
alter table product drop column if exists moq;

alter table product_variant drop column if exists wholesale_price;
alter table product_variant drop column if exists tier_prices;
alter table product_variant drop column if exists moq;

alter table customer drop column if exists customer_type;
alter table customer drop column if exists business_name;
alter table customer drop column if exists trade_license_no;
alter table customer drop column if exists bin_no;
alter table customer drop column if exists credit_limit;
alter table customer drop column if exists current_due;
alter table customer drop column if exists is_verified;

alter table orders drop column if exists order_mode;
alter table orders drop column if exists is_purchase_order;
alter table orders drop column if exists po_reference;
alter table orders drop column if exists credit_approved;
alter table orders drop column if exists credit_due;
alter table orders drop column if exists credit_terms;

alter table marketplace_listing drop column if exists is_wholesale;
alter table marketplace_listing drop column if exists wholesale_only;
alter table marketplace_listing drop column if exists moq;

alter table marketplace_listing_variant drop column if exists wholesale_price;
alter table marketplace_listing_variant drop column if exists tier_prices;
alter table marketplace_listing_variant drop column if exists moq;

alter table marketplace_customer drop column if exists customer_type;
alter table marketplace_customer drop column if exists business_name;
alter table marketplace_customer drop column if exists trade_license_no;
alter table marketplace_customer drop column if exists bin_no;
alter table marketplace_customer drop column if exists is_verified;

drop table if exists purchase_request cascade;
drop table if exists customer_ledger cascade;

drop type if exists tenant_business_type cascade;
drop type if exists customer_type cascade;
drop type if exists order_mode cascade;
