-- 20_abandoned_carts.sql — tracks in-progress carts (with email/phone captured
-- but no order placed). Powers the abandoned-cart recovery automation: SMS
-- or email sent after a configurable delay (default 1h, 24h).

create table if not exists cart (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  customer_id   uuid references customer(id) on delete set null,
  email         text,
  phone         text,
  items         jsonb not null,        -- [{productId, variantId, title, qty, unitPrice}]
  total         numeric(12,2) not null default 0,
  recovery_token text unique default encode(gen_random_bytes(16), 'hex'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  abandoned_at  timestamptz,         -- set when checkout abandoned (no order placed in 30 min)
  recovered_at  timestamptz          -- set when cart converts to order
);

create index if not exists cart_tenant_idx
  on cart (tenant_id, updated_at desc)
  where recovered_at is null;

create index if not exists cart_abandoned_idx
  on cart (abandoned_at)
  where abandoned_at is not null and recovered_at is null;

-- RLS
alter table cart enable row level security;
create policy cart_tenant_all on cart
  for all using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- Reminder log — track which reminders fired so we don't spam.
create table if not exists cart_reminder (
  id           uuid primary key default gen_random_uuid(),
  cart_id      uuid not null references cart(id) on delete cascade,
  tenant_id    uuid not null references tenant(id) on delete cascade,
  channel      text not null check (channel in ('sms','email')),
  template_key text not null,
  sent_at      timestamptz not null default now(),
  status       text not null default 'sent'
);

create index if not exists cart_reminder_lookup_idx
  on cart_reminder (cart_id, channel, template_key);

alter table cart_reminder enable row level security;
create policy cart_reminder_tenant_select on cart_reminder
  for select using (tenant_id = app.current_tenant_id());
