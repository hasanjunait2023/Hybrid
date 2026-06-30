-- Down migration for 38_o9_order_tags.sql
alter table orders drop column if exists tags;
alter table tenant drop column if exists order_tag_vocabulary;

drop index if exists orders_tags_vip_idx;
drop index if exists orders_tags_gift_idx;
drop index if exists orders_tags_fragile_idx;
