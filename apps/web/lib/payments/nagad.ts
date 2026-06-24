// Nagad payment WIRING (blueprint SHIFT 2 — per-tenant creds). The pure provider
// lives in @hybrid/payments (HTTP injectable, no DB/env); this module composes it
// with the app's real dependencies: the platform `fetch` as transport, and the
// decrypted payment_account.credentials read inside withTenant + openCredentials.
//
// Nagad uses a per-merchant RSA keypair (NOT OAuth) — merchant_private_key is a
// PEM block sealed AES-256-GCM at rest, only ever decrypted server-side here and
// handed to the provider for the duration of a single call. Never logged, never
// returned to a client.
import "server-only";
import { NagadProvider } from "@hybrid/payments";
import type { ProviderCreds } from "@hybrid/payments";
import { withTenant, openCredentials, isSealed } from "@hybrid/db";

// Shape of the decrypted Nagad credentials jsonb (set by the settings slice).
interface NagadCredentials {
  mode?: "sandbox" | "live";
  merchantId?: string;
  merchantPrivateKey?: string;
  nagadPublicKey?: string;
}

/** A NagadProvider bound to the platform fetch. Stateless — creds passed per call. */
export function getNagadProvider(): NagadProvider {
  return new NagadProvider({ fetch: (url, init) => fetch(url, init) });
}

// Read + decrypt the enabled Nagad account for a tenant. Runs inside withTenant so
// RLS scopes the payment_account row. Returns null when Nagad is not
// configured/enabled (caller falls back / rejects).
export async function getNagadCreds(tenantId: string): Promise<ProviderCreds | null> {
  const rows = await withTenant(tenantId, null, (tx) =>
    tx<{ credentials: unknown; is_enabled: boolean }[]>`
      select credentials, is_enabled
        from payment_account
       where provider = 'nagad'
       limit 1
    `,
  );

  const account = rows[0];
  if (!account || !account.is_enabled) return null;

  const sealed = account.credentials;
  const raw = (isSealed(sealed) ? openCredentials(sealed) : sealed) as NagadCredentials;

  if (!raw.merchantId || !raw.merchantPrivateKey || !raw.nagadPublicKey) {
    return null;
  }

  return {
    mode: raw.mode === "live" ? "live" : "sandbox",
    merchantId: raw.merchantId,
    merchantPrivateKey: raw.merchantPrivateKey,
    nagadPublicKey: raw.nagadPublicKey,
  };
}

export interface EnabledNagad {
  provider: NagadProvider;
  creds: ProviderCreds;
}

// The enabled provider + creds for a tenant, or null when Nagad is unavailable.
// Both the checkout action and the callback go through this for one decrypt path.
export async function getEnabledNagad(tenantId: string): Promise<EnabledNagad | null> {
  const creds = await getNagadCreds(tenantId);
  if (!creds) return null;
  return { provider: getNagadProvider(), creds };
}
