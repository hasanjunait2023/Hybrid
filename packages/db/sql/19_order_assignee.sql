-- 19_order_assignee.sql — internal staff assignment + per-order notes.
-- assignment lets a manager route orders to specific staff members (e.g.
-- "packed by Rahim" or "needs review by Karim"). The dashboard surfaces the
-- assignee so multiple staff can coordinate without overlapping.

alter table orders
  add column if not exists assignee_id uuid references app_user(id) on delete set null,
  add column if not exists assigned_at timestamptz;

create index if not exists orders_assignee_idx
  on orders (assignee_id, placed_at desc)
  where assignee_id is not null;

-- Add a separate order_note table for multi-note timeline (different from the
-- legacy text column).
create table if not exists order_note (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  order_id    uuid not null references orders(id) on delete cascade,
  author_id   uuid references app_user(id) on delete set null,
  body        text not null check (length(body) > 0 and length(body) <= 2000),
  created_at  timestamptz not null default now()
);

create index if not exists order_note_lookup_idx
  on order_note (order_id, created_at desc);

-- RLS: tenant members can read/write their own order notes
alter table order_note enable row level security;

create policy order_note_tenant_select on order_note
  for select using (tenant_id = app.current_tenant_id());

create policy order_note_tenant_modify on order_note
  for insert with check (
    tenant_id = app.current_tenant_id()
    and (author_id is null or author_id = app.current_user_id())
  );

create policy order_note_tenant_update on order_note
  for update using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy order_note_tenant_delete on order_note
  for delete using (
    tenant_id = app.current_tenant_id()
    and (author_id = app.current_user_id() or app.is_platform_admin())
  );
