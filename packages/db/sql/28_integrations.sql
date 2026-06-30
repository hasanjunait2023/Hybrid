-- ============================================================================
-- 28_integrations.sql — External platform integrations (channel connector).
--
-- Enables a tenant to link their existing website (Shopify, WooCommerce,
-- custom REST API) to Hybrid and continuously sync products, inventory, and
-- orders in both directions. Three tables:
--
--   external_integration  — one row per connected platform (credentials enc.)
--   external_entity_map   — maps external IDs → internal IDs (idempotent sync)
--   sync_log              — per-operation audit trail
--
-- RLS: all three tables are tenant-scoped (tenant_id = app.current_tenant_id).
-- Credentials stored as AES-256-GCM encrypted blobs (same as courier creds).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Enum types
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'integration_platform') then
    create type integration_platform as enum (
      'shopify',
      'woocommerce',
      'custom_api',
      'webhook_only'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'integration_status') then
    create type integration_status as enum (
      'pending',    -- credentials entered, not yet verified
      'active',     -- connected + verified
      'paused',     -- sync disabled by tenant
      'error'       -- last sync failed; see sync_error
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'sync_entity_type') then
    create type sync_entity_type as enum (
      'product',
      'variant',
      'inventory',
      'order',
      'customer'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'sync_direction') then
    create type sync_direction as enum (
      'import',       -- external → Hybrid
      'export',       -- Hybrid → external
      'bidirectional' -- both (conflict: external wins unless noted)
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'sync_trigger') then
    create type sync_trigger as enum (
      'manual',     -- tenant clicked "Sync now"
      'webhook',    -- real-time push from external
      'scheduled'   -- periodic background cron
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'sync_status') then
    create type sync_status as enum (
      'running',
      'success',
      'partial',  -- some items succeeded, some failed
      'error'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. external_integration — one row per connected external platform
-- ---------------------------------------------------------------------------
create table if not exists external_integration (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  platform        integration_platform not null,
  display_name    text not null,
  status          integration_status not null default 'pending',

  -- AES-256-GCM encrypted JSON blob (shop URL, API key, secret, etc.)
  credentials     text,

  -- Incoming webhook secret for verifying HMAC signatures (encrypted)
  webhook_secret  text,

  -- Stable token for our /api/integrations/webhook/[id] endpoint
  -- Generated once, never changes; identifies which tenant the event is for.
  webhook_token   text not null unique default encode(gen_random_bytes(32), 'hex'),

  -- Sync configuration jsonb:
  -- {
  --   "entities": {
  --     "product":   { "enabled": true,  "direction": "import"         },
  --     "inventory": { "enabled": true,  "direction": "bidirectional"  },
  --     "order":     { "enabled": false, "direction": "export"         }
  --   },
  --   "auto_sync": true,
  --   "sync_interval_minutes": 60,
  --   "field_overrides": {}
  -- }
  config          jsonb not null default '{
    "entities": {
      "product":   { "enabled": true,  "direction": "import" },
      "inventory": { "enabled": true,  "direction": "bidirectional" },
      "order":     { "enabled": false, "direction": "export" }
    },
    "auto_sync": true,
    "sync_interval_minutes": 60
  }'::jsonb,

  last_synced_at  timestamptz,
  sync_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists external_integration_tenant_idx
  on external_integration (tenant_id);

create index if not exists external_integration_status_idx
  on external_integration (status)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- 2. external_entity_map — maps external IDs → Hybrid IDs
--    Used for idempotent syncing; avoids duplicate inserts on re-sync.
-- ---------------------------------------------------------------------------
create table if not exists external_entity_map (
  id              uuid primary key default gen_random_uuid(),
  integration_id  uuid not null references external_integration(id) on delete cascade,
  tenant_id       uuid not null,
  entity_type     sync_entity_type not null,
  external_id     text not null,    -- ID on the external platform
  internal_id     uuid not null,    -- ID inside Hybrid
  external_hash   text,             -- hash of last-seen external payload (change detection)
  synced_at       timestamptz not null default now(),
  unique (integration_id, entity_type, external_id)
);

create index if not exists external_entity_map_internal_idx
  on external_entity_map (tenant_id, entity_type, internal_id);

-- ---------------------------------------------------------------------------
-- 3. sync_log — per-operation audit trail
-- ---------------------------------------------------------------------------
create table if not exists sync_log (
  id              uuid primary key default gen_random_uuid(),
  integration_id  uuid not null references external_integration(id) on delete cascade,
  tenant_id       uuid not null,
  entity_type     sync_entity_type not null,
  direction       sync_direction not null,
  trigger         sync_trigger not null,
  status          sync_status not null default 'running',
  items_synced    int not null default 0,
  items_failed    int not null default 0,
  error_detail    text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create index if not exists sync_log_integration_idx
  on sync_log (integration_id, started_at desc);

create index if not exists sync_log_tenant_idx
  on sync_log (tenant_id, started_at desc);

-- ---------------------------------------------------------------------------
-- 4. RLS — tenant isolation
-- ---------------------------------------------------------------------------

alter table external_integration   enable row level security;
alter table external_entity_map    enable row level security;
alter table sync_log               enable row level security;

do $$
declare t text;
  tbls text[] := array['external_integration','external_entity_map','sync_log'];
begin
  foreach t in array tbls loop
    -- Tenant sees only its own rows.
    begin
      execute format(
        'create policy %1$I_tenant_policy on %1$I
           using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
           with check (tenant_id = app.current_tenant_id() or app.is_platform_admin())',
        t
      );
    exception when duplicate_object then null;
    end;
    execute format('alter table %I force row level security;', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Grants to runtime role
-- ---------------------------------------------------------------------------
grant select, insert, update, delete
  on external_integration, external_entity_map, sync_log
  to app_runtime;
