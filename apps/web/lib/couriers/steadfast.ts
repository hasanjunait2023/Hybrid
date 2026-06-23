// Courier wiring (blueprint S-COURIER-WIRE 1.8). The @hybrid/couriers package is
// PURE — it takes an injected fetch + per-call creds. This module is the app-side
// glue: it constructs the SteadfastProvider with the platform `fetch`, and reads
// + decrypts the tenant's courier_account credentials inside withTenant so the
// RLS context is always set and the sealed secret is only ever opened server-side.
//
// Secrets are NEVER logged or returned to a caller as plaintext beyond the
// CourierCreds handed straight to the provider for a single API call.
//
// Server-only by construction (it imports @hybrid/db / uses the platform fetch);
// imported only from Server Actions and the internal cron route.
import { withTenant, openCredentials, isSealed } from "@hybrid/db";
import type { Tx } from "@hybrid/db";
import { SteadfastProvider } from "@hybrid/couriers";
import type { CourierCreds } from "@hybrid/couriers";

// One provider instance for the app, wired to the platform fetch. The adapter
// holds no creds — those are passed per call — so a singleton is safe.
let provider: SteadfastProvider | null = null;

export function getSteadfastProvider(): SteadfastProvider {
  if (!provider) {
    provider = new SteadfastProvider({ fetch: (url, init) => fetch(url, init) });
  }
  return provider;
}

// Thrown when a tenant has no configured Steadfast account. The courier-sync
// cron uses this to skip cleanly; sendToCourier maps it to a friendly message.
export class CourierNotConfiguredError extends Error {
  constructor() {
    super("COURIER_NOT_CONFIGURED");
    this.name = "CourierNotConfiguredError";
  }
}

// Read + decrypt the tenant's Steadfast credentials INSIDE an existing txn (so
// the caller can do the read in the same withTenant unit as the rest of its
// work). Returns null when no enabled/sealed account exists — callers decide
// whether that is a skip (cron) or an error (manual send).
export async function readSteadfastCreds(tx: Tx): Promise<CourierCreds | null> {
  const rows = await tx<{ is_enabled: boolean; credentials: unknown }[]>`
    select is_enabled, credentials
    from courier_account
    where provider = 'steadfast'
    limit 1
  `;
  const row = rows[0];
  if (!row || !row.is_enabled || !isSealed(row.credentials)) return null;

  const creds = openCredentials(row.credentials);
  if (!creds.apiKey || !creds.secretKey) return null;

  return { apiKey: creds.apiKey, secretKey: creds.secretKey };
}

// Convenience wrapper that opens its own withTenant txn (used outside a larger
// transaction). Throws CourierNotConfiguredError when unconfigured.
export async function loadSteadfastCreds(
  tenantId: string,
  userId: string | null,
): Promise<CourierCreds> {
  const creds = await withTenant(tenantId, userId, (tx) => readSteadfastCreds(tx));
  if (!creds) throw new CourierNotConfiguredError();
  return creds;
}
