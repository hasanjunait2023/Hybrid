// SSLCommerz payment WIRING (blueprint SHIFT 2 — per-tenant creds). The pure
// provider lives in @hybrid/payments; this module composes it with the platform
// `fetch` and the decrypted payment_account.credentials read inside withTenant.
//
// SSLCommerz uses {store_id, store_password} — store_password is sealed
// AES-256-GCM at rest, only ever decrypted server-side here and handed to the
// provider for a single call. Never logged, never returned to a client.
import "server-only";
import { SslcommerzProvider } from "@hybrid/payments";
import type { ProviderCreds } from "@hybrid/payments";
import { withTenant, openCredentials, isSealed } from "@hybrid/db";

interface SslcommerzCredentials {
  mode?: "sandbox" | "live";
  storeId?: string;
  storePassword?: string;
}

/** An SslcommerzProvider bound to the platform fetch. Creds passed per call. */
export function getSslcommerzProvider(): SslcommerzProvider {
  return new SslcommerzProvider({ fetch: (url, init) => fetch(url, init) });
}

export async function getSslcommerzCreds(tenantId: string): Promise<ProviderCreds | null> {
  const rows = await withTenant(tenantId, null, (tx) =>
    tx<{ credentials: unknown; is_enabled: boolean }[]>`
      select credentials, is_enabled
        from payment_account
       where provider = 'sslcommerz'
       limit 1
    `,
  );

  const account = rows[0];
  if (!account || !account.is_enabled) return null;

  const sealed = account.credentials;
  const raw = (isSealed(sealed) ? openCredentials(sealed) : sealed) as SslcommerzCredentials;

  if (!raw.storeId || !raw.storePassword) {
    return null;
  }

  return {
    mode: raw.mode === "live" ? "live" : "sandbox",
    storeId: raw.storeId,
    storePassword: raw.storePassword,
  };
}

export interface EnabledSslcommerz {
  provider: SslcommerzProvider;
  creds: ProviderCreds;
}

export async function getEnabledSslcommerz(tenantId: string): Promise<EnabledSslcommerz | null> {
  const creds = await getSslcommerzCreds(tenantId);
  if (!creds) return null;
  return { provider: getSslcommerzProvider(), creds };
}
