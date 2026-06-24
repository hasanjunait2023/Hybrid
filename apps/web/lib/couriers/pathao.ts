// Pathao courier WIRING (blueprint S-PATHAO-WIRE / SHIFT 2). The @hybrid/couriers
// PathaoProvider is PURE — it takes an injected fetch, an injected TokenStore for
// the bearer-token cache, and per-call creds. This module is the app-side glue:
//
//   * platform `fetch` as transport,
//   * a Redis-backed TokenStore at key pathao:token:{tenantId} so the OAuth2
//     bearer token is shared across requests/instances for its lifetime,
//   * decrypted courier_account.credentials read inside withTenant +
//     openCredentials (RLS context always set; sealed secret opened server-side
//     only).
//
// The sealed credential holds {clientId, clientSecret, username, password} plus
// the default store + geography {storeId, cityId, zoneId, areaId}. The bearer
// token lives in Redis only (not the DB) — no write-back of the token itself.
import "server-only";
import { PathaoProvider } from "@hybrid/couriers";
import type { CourierCreds, TokenStore } from "@hybrid/couriers";
import { withTenant, openCredentials, isSealed } from "@hybrid/db";
import type { Tx } from "@hybrid/db";
import { getCache } from "@/lib/redis/client";
import { CourierNotConfiguredError } from "./steadfast";

// Adapt the app cache (CacheClient) to the package's TokenStore. The per-tenant
// key is composed by the caller (tokenCacheKey), so this store is tenant-agnostic.
function redisTokenStore(): TokenStore {
  const cache = getCache();
  return {
    get: (key: string) => cache.get(key),
    set: (key: string, value: string, ttlSeconds: number) => cache.set(key, value, ttlSeconds),
  };
}

export function pathaoTokenCacheKey(tenantId: string): string {
  return `pathao:token:${tenantId}`;
}

/** A PathaoProvider bound to this tenant's Redis bearer-token cache key. */
export function getPathaoProvider(tenantId: string): PathaoProvider {
  return new PathaoProvider({
    fetch: (url, init) => fetch(url, init),
    tokenStore: redisTokenStore(),
    tokenCacheKey: pathaoTokenCacheKey(tenantId),
  });
}

// Shape of the decrypted Pathao credentials jsonb (set by the courier settings
// slice). mode selects stage vs live base inside the provider.
interface PathaoCredentials {
  mode?: "stage" | "live";
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
  storeId?: string;
  cityId?: string;
  zoneId?: string;
  areaId?: string;
}

// Read + decrypt the tenant's Pathao credentials INSIDE an existing txn (so the
// caller can do the read in the same withTenant unit as the rest of its work).
// Returns null when no enabled/sealed account exists — callers decide whether
// that is a skip (cron) or an error (manual send).
export async function readPathaoCreds(tx: Tx): Promise<CourierCreds | null> {
  const rows = await tx<{ is_enabled: boolean; credentials: unknown }[]>`
    select is_enabled, credentials
    from courier_account
    where provider = 'pathao'
    limit 1
  `;
  const row = rows[0];
  if (!row || !row.is_enabled || !isSealed(row.credentials)) return null;

  const raw = openCredentials(row.credentials) as PathaoCredentials;
  if (!raw.clientId || !raw.clientSecret || !raw.username || !raw.password) return null;

  return {
    clientId: raw.clientId,
    clientSecret: raw.clientSecret,
    username: raw.username,
    password: raw.password,
    storeId: raw.storeId,
    cityId: raw.cityId,
    zoneId: raw.zoneId,
    areaId: raw.areaId,
    // mode is read by the provider via a loose cast; "live" → live base.
    ...(raw.mode === "live" ? { mode: "live" } : {}),
  } as CourierCreds;
}

// Convenience wrapper that opens its own withTenant txn (used outside a larger
// transaction). Throws CourierNotConfiguredError when unconfigured.
export async function loadPathaoCreds(
  tenantId: string,
  userId: string | null,
): Promise<CourierCreds> {
  const creds = await withTenant(tenantId, userId, (tx) => readPathaoCreds(tx));
  if (!creds) throw new CourierNotConfiguredError();
  return creds;
}
