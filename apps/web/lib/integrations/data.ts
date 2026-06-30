// DB operations for external integrations (all via withTenant — RLS enforced).
import { withTenant, asPlatformAdmin } from "@hybrid/db";
import { sealCredentials, openCredentials, isSealed } from "@hybrid/db";
import type {
  Integration,
  IntegrationPlatform,
  IntegrationStatus,
  SyncConfig,
  PlatformCredentials,
  SyncLogRow,
  SyncEntityType,
  SyncDirection,
  SyncTrigger,
  SyncStatusType,
} from "./types";
import { DEFAULT_SYNC_CONFIG as DSC } from "./types";

// ---------------------------------------------------------------------------
// Credential sealing helpers
// PlatformCredentials may have nested objects (e.g. CustomApiCredentials.endpoints).
// We serialise the whole object as a JSON string, seal it as a single-key flat
// record { p: jsonString }, then store the resulting SealedSecret as JSON text.
// ---------------------------------------------------------------------------

export function sealIntegrationCredentials(creds: PlatformCredentials): string {
  const sealed = sealCredentials({ p: JSON.stringify(creds) });
  return JSON.stringify(sealed);
}

export function openIntegrationCredentials(sealedText: string): PlatformCredentials {
  const parsed: unknown = JSON.parse(sealedText);
  if (!isSealed(parsed)) throw new Error("openIntegrationCredentials: not a sealed envelope");
  const flat = openCredentials(parsed);
  return JSON.parse(flat.p ?? "{}") as PlatformCredentials;
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function mapRow(row: {
  id: string;
  tenant_id: string;
  platform: string;
  display_name: string;
  status: string;
  credentials: string | null;
  webhook_token: string;
  config: unknown;
  last_synced_at: string | null;
  sync_error: string | null;
  created_at: string;
}): Integration {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    platform: row.platform as IntegrationPlatform,
    displayName: row.display_name,
    status: row.status as IntegrationStatus,
    credentialsSealed: row.credentials,
    webhookToken: row.webhook_token,
    config: (row.config as SyncConfig) ?? DSC,
    lastSyncedAt: row.last_synced_at,
    syncError: row.sync_error,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listIntegrations(
  tenantId: string,
  userId: string,
): Promise<Integration[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{
      id: string; tenant_id: string; platform: string; display_name: string;
      status: string; credentials: string | null; webhook_token: string;
      config: unknown; last_synced_at: string | null; sync_error: string | null; created_at: string;
    }[]>`
      select id, tenant_id, platform, display_name, status, credentials,
             webhook_token, config, last_synced_at, sync_error, created_at
      from external_integration
      where tenant_id = ${tenantId}
      order by created_at desc
    `,
  );
  return rows.map(mapRow);
}

export async function getIntegration(
  tenantId: string,
  userId: string | null,
  integrationId: string,
): Promise<Integration | null> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{
      id: string; tenant_id: string; platform: string; display_name: string;
      status: string; credentials: string | null; webhook_token: string;
      config: unknown; last_synced_at: string | null; sync_error: string | null; created_at: string;
    }[]>`
      select id, tenant_id, platform, display_name, status, credentials,
             webhook_token, config, last_synced_at, sync_error, created_at
      from external_integration
      where id = ${integrationId} and tenant_id = ${tenantId}
      limit 1
    `,
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Look up integration by webhook_token (used in the public webhook endpoint). */
export async function getIntegrationByToken(
  token: string,
): Promise<{ id: string; tenantId: string; webhookSecret: string | null; platform: string } | null> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ id: string; tenant_id: string; webhook_secret: string | null; platform: string }[]>`
      select id, tenant_id, webhook_secret, platform
      from external_integration
      where webhook_token = ${token} and status = 'active'
      limit 1
    `,
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    tenantId: rows[0].tenant_id,
    webhookSecret: rows[0].webhook_secret,
    platform: rows[0].platform,
  };
}

export async function createIntegration(
  tenantId: string,
  userId: string,
  platform: IntegrationPlatform,
  displayName: string,
  credentialsSealed: string,
  config: SyncConfig,
): Promise<Integration> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{
      id: string; tenant_id: string; platform: string; display_name: string;
      status: string; credentials: string | null; webhook_token: string;
      config: unknown; last_synced_at: string | null; sync_error: string | null; created_at: string;
    }[]>`
      insert into external_integration (tenant_id, platform, display_name, credentials, config)
      values (${tenantId}, ${platform}, ${displayName}, ${credentialsSealed}, ${JSON.stringify(config)}::jsonb)
      returning id, tenant_id, platform, display_name, status, credentials,
                webhook_token, config, last_synced_at, sync_error, created_at
    `,
  );
  return mapRow(rows[0]!);
}

export async function updateIntegrationStatus(
  tenantId: string,
  integrationId: string,
  status: IntegrationStatus,
  syncError?: string | null,
): Promise<void> {
  await asPlatformAdmin((tx) =>
    tx`
      update external_integration
      set status = ${status},
          sync_error = ${syncError ?? null},
          last_synced_at = case when ${status} = 'active' then now() else last_synced_at end,
          updated_at = now()
      where id = ${integrationId} and tenant_id = ${tenantId}
    `,
  );
}

export async function updateIntegrationConfig(
  tenantId: string,
  userId: string,
  integrationId: string,
  config: SyncConfig,
): Promise<void> {
  await withTenant(tenantId, userId, (tx) =>
    tx`
      update external_integration
      set config = ${JSON.stringify(config)}::jsonb, updated_at = now()
      where id = ${integrationId} and tenant_id = ${tenantId}
    `,
  );
}

export async function deleteIntegration(
  tenantId: string,
  userId: string,
  integrationId: string,
): Promise<void> {
  await withTenant(tenantId, userId, (tx) =>
    tx`
      delete from external_integration
      where id = ${integrationId} and tenant_id = ${tenantId}
    `,
  );
}

// ---------------------------------------------------------------------------
// Entity map (idempotent sync tracking)
// ---------------------------------------------------------------------------

export async function upsertEntityMap(
  tenantId: string,
  integrationId: string,
  entityType: SyncEntityType,
  externalId: string,
  internalId: string,
  externalHash?: string,
): Promise<void> {
  await asPlatformAdmin((tx) =>
    tx`
      insert into external_entity_map
        (integration_id, tenant_id, entity_type, external_id, internal_id, external_hash, synced_at)
      values
        (${integrationId}, ${tenantId}, ${entityType}, ${externalId}, ${internalId}, ${externalHash ?? null}, now())
      on conflict (integration_id, entity_type, external_id)
      do update set
        internal_id    = excluded.internal_id,
        external_hash  = excluded.external_hash,
        synced_at      = now()
    `,
  );
}

export async function getEntityMap(
  integrationId: string,
  entityType: SyncEntityType,
  externalId: string,
): Promise<{ internalId: string; externalHash: string | null } | null> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ internal_id: string; external_hash: string | null }[]>`
      select internal_id, external_hash
      from external_entity_map
      where integration_id = ${integrationId}
        and entity_type    = ${entityType}
        and external_id    = ${externalId}
      limit 1
    `,
  );
  if (!rows[0]) return null;
  return { internalId: rows[0].internal_id, externalHash: rows[0].external_hash };
}

/** Get internal → external mapping (used for export/push). */
export async function getExternalId(
  integrationId: string,
  entityType: SyncEntityType,
  internalId: string,
): Promise<string | null> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ external_id: string }[]>`
      select external_id
      from external_entity_map
      where integration_id = ${integrationId}
        and entity_type    = ${entityType}
        and internal_id    = ${internalId}
      limit 1
    `,
  );
  return rows[0]?.external_id ?? null;
}

// ---------------------------------------------------------------------------
// Sync log
// ---------------------------------------------------------------------------

export async function createSyncLog(
  integrationId: string,
  tenantId: string,
  entityType: SyncEntityType,
  direction: SyncDirection,
  trigger: SyncTrigger,
): Promise<string> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ id: string }[]>`
      insert into sync_log (integration_id, tenant_id, entity_type, direction, trigger, status)
      values (${integrationId}, ${tenantId}, ${entityType}, ${direction}, ${trigger}, 'running')
      returning id
    `,
  );
  return rows[0]!.id;
}

export async function finishSyncLog(
  logId: string,
  status: SyncStatusType,
  itemsSynced: number,
  itemsFailed: number,
  errorDetail?: string | null,
): Promise<void> {
  await asPlatformAdmin((tx) =>
    tx`
      update sync_log
      set status        = ${status},
          items_synced  = ${itemsSynced},
          items_failed  = ${itemsFailed},
          error_detail  = ${errorDetail ?? null},
          finished_at   = now()
      where id = ${logId}
    `,
  );
}

export async function listSyncLogs(
  tenantId: string,
  userId: string,
  integrationId: string,
  limit = 20,
): Promise<SyncLogRow[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{
      id: string; integration_id: string; entity_type: string; direction: string;
      trigger: string; status: string; items_synced: number; items_failed: number;
      error_detail: string | null; started_at: string; finished_at: string | null;
    }[]>`
      select id, integration_id, entity_type, direction, trigger, status,
             items_synced, items_failed, error_detail, started_at, finished_at
      from sync_log
      where integration_id = ${integrationId} and tenant_id = ${tenantId}
      order by started_at desc
      limit ${limit}
    `,
  );
  return rows.map((r) => ({
    id: r.id,
    integrationId: r.integration_id,
    entityType: r.entity_type as SyncEntityType,
    direction: r.direction as SyncDirection,
    trigger: r.trigger as SyncTrigger,
    status: r.status as SyncStatusType,
    itemsSynced: r.items_synced,
    itemsFailed: r.items_failed,
    errorDetail: r.error_detail,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  }));
}

// ---------------------------------------------------------------------------
// List active integrations for scheduled sync (platform-admin)
// ---------------------------------------------------------------------------

export async function listActiveIntegrationsForSync(): Promise<
  { id: string; tenantId: string; platform: string; credentials: string | null; config: SyncConfig }[]
> {
  return asPlatformAdmin((tx) =>
    tx<{ id: string; tenant_id: string; platform: string; credentials: string | null; config: unknown }[]>`
      select id, tenant_id, platform, credentials, config
      from external_integration
      where status = 'active'
        and (config->>'auto_sync')::boolean = true
        and (
          last_synced_at is null
          or last_synced_at < now() - make_interval(mins => (config->>'sync_interval_minutes')::int)
        )
      order by last_synced_at nulls first
      limit 20
    `,
  ).then((rows) =>
    rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      platform: r.platform,
      credentials: r.credentials,
      config: (r.config as SyncConfig) ?? DSC,
    })),
  );
}
