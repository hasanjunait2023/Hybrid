// Hybrid Pay payment WIRING. The pure provider lives in @hybrid/payments (HTTP
// injectable, no DB/env); this module composes it with the app's real deps:
//   * the platform `fetch` as the transport,
//   * decrypted payment_account.credentials read inside withTenant + openCredentials.
//
// Hybrid Pay is Hybrid's single white-labeled online gateway (PipraPay engine).
// Each tenant has its own brand on the shared instance: {apiKey, baseUrl} sealed
// AES-256-GCM at rest, decrypted server-side here only — never logged, never
// returned to a client. The pure package receives ProviderCreds per call.
import "server-only";
import { HybridpayProvider } from "@hybrid/payments";
import type { ProviderCreds } from "@hybrid/payments";
import { withTenant, openCredentials, isSealed } from "@hybrid/db";

// Shape of the decrypted Hybrid Pay credentials jsonb (set by the settings slice).
interface HybridpayCredentials {
  apiKey?: string;
  baseUrl?: string;
}

/** A stateless HybridpayProvider bound to the platform fetch transport. */
export function getHybridpayProvider(): HybridpayProvider {
  return new HybridpayProvider({ fetch: globalThis.fetch });
}

// Read + decrypt the enabled Hybrid Pay account for a tenant. Runs inside
// withTenant so RLS scopes the payment_account row. Returns null when Hybrid Pay
// is not configured/enabled for the tenant (caller falls back / rejects).
export async function getHybridpayCreds(tenantId: string): Promise<ProviderCreds | null> {
  const rows = await withTenant(tenantId, null, (tx) =>
    tx<{ credentials: unknown; is_enabled: boolean }[]>`
      select credentials, is_enabled
        from payment_account
       where provider = 'hybridpay'
       limit 1
    `,
  );

  const account = rows[0];
  if (!account || !account.is_enabled) return null;

  const sealed = account.credentials;
  const raw = (isSealed(sealed) ? openCredentials(sealed) : sealed) as HybridpayCredentials;

  if (!raw.apiKey || !raw.baseUrl) return null;

  return {
    // mode is unused by the Hybrid Pay provider (the instance URL is the env).
    mode: "live",
    apiKey: raw.apiKey,
    baseUrl: raw.baseUrl,
  };
}

export interface EnabledHybridpay {
  provider: HybridpayProvider;
  creds: ProviderCreds;
}

// Convenience: the enabled provider + creds for a tenant, or null when Hybrid Pay
// is not available. Both the checkout (create-charge) and the webhook go through
// this so there's one decryption path.
export async function getEnabledHybridpay(tenantId: string): Promise<EnabledHybridpay | null> {
  const creds = await getHybridpayCreds(tenantId);
  if (!creds) return null;
  return { provider: getHybridpayProvider(), creds };
}
