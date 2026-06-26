drop table if exists order_note;
alter table orders drop column if exists assigned_at;
alter table orders drop column if exists assignee_id;
