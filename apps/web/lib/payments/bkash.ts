// bKash payment WIRING (blueprint S-CHECKOUT; research §1). The pure provider
// lives in @hybrid/payments (HTTP injectable, no DB/env); this module composes
// it with the app's real dependencies:
//   * the platform `fetch` as the transport,
//   * a Redis-backed TokenStore (key bkash:token:{tenantId}) for the grant-token
//     cache (≈3600s) so the id_token is shared across requests/instances,
//   * decrypted payment_account.credentials read inside withTenant + openCredentials.
//
// Secrets (appKey/appSecret/username/password) are AES-256-GCM at rest and are
// only ever decrypted server-side here — never logged, never returned to a
// client. The pure package receives ProviderCreds for the duration of a call.
import "server-only";
import { BkashProvider } from "@hybrid/payments";
import type { ProviderCreds, TokenStore } from "@hybrid/payments";
import { withTenant, openCredentials, isSealed } from "@hybrid/db";
import { getCache } from "@/lib/redis/client";

// Shape of the decrypted bKash credentials jsonb (set by the settings slice).
// mode selects sandbox vs live base URL inside the provider.
interface BkashCredentials {
  mode?: "sandbox" | "live";
  username?: string;
  password?: string;
  appKey?: string;
  appSecret?: string;
}

// Adapt the app cache (CacheClient) to the package's TokenStore. Per-tenant key
// is composed by the caller (tokenCacheKey), so this store is tenant-agnostic.
function redisTokenStore(): TokenStore {
  const cache = getCache();
  return {
    get: (key: string) => cache.get(key),
    set: (key: string, value: string, ttlSeconds: number) =>
      cache.set(key, value, ttlSeconds),
    setNx: (key: string, value: string, ttlSeconds: number) =>
      cache.setNx(key, value, ttlSeconds),
  };
}

export function tokenCacheKey(tenantId: string): string {
  return `bkash:token:${tenantId}`;
}

/** A BkashProvider bound to this tenant's grant-token cache key. */
export function getBkashProvider(tenantId: string): BkashProvider {
  return new BkashProvider({
    fetch: globalThis.fetch,
    tokenStore: redisTokenStore(),
    tokenCacheKey: tokenCacheKey(tenantId),
  });
}

// Read + decrypt the enabled bKash account for a tenant. Runs inside withTenant
// so RLS scopes the payment_account row. Returns null when bKash is not
// configured/enabled for the tenant (caller falls back / rejects).
export async function getBkashCreds(tenantId: string): Promise<ProviderCreds | null> {
  const rows = await withTenant(tenantId, null, (tx) =>
    tx<{ credentials: unknown; is_enabled: boolean }[]>`
      select credentials, is_enabled
        from payment_account
       where provider = 'bkash'
       limit 1
    `,
  );

  const account = rows[0];
  if (!account || !account.is_enabled) return null;

  // credentials jsonb is a sealed envelope (AES-256-GCM). Decrypt to the raw map.
  const sealed = account.credentials;
  const raw = (isSealed(sealed) ? openCredentials(sealed) : sealed) as BkashCredentials;

  if (!raw.username || !raw.password || !raw.appKey || !raw.appSecret) {
    return null;
  }

  return {
    mode: raw.mode === "live" ? "live" : "sandbox",
    username: raw.username,
    password: raw.password,
    appKey: raw.appKey,
    appSecret: raw.appSecret,
  };
}

export interface EnabledBkash {
  provider: BkashProvider;
  creds: ProviderCreds;
}

// Convenience: the enabled provider + creds for a tenant, or null when bKash is
// not available. The checkout action and the callback both go through this so
// there's one decryption path.
export async function getEnabledBkash(tenantId: string): Promise<EnabledBkash | null> {
  const creds = await getBkashCreds(tenantId);
  if (!creds) return null;
  return { provider: getBkashProvider(tenantId), creds };
}
