// Per-tenant analytics configuration (blueprint 2.7). Provider IDs/secrets live
// in tenant.settings.analytics (jsonb, RLS-protected) — no dedicated table.
//
//   PUBLIC (plaintext OK):  ga4MeasurementId, fbPixelId
//   SECRET (sealed AES-GCM): ga4ApiSecret, fbAccessToken
//   fbTestEventCode:        non-secret, plaintext (a Meta test-events label)
//
// The secret pair is sealed with sealCredentials into a single envelope under
// `analytics.credentials`; the public IDs sit alongside in plaintext. This module
// is the ONLY place the sealed envelope is opened — and only server-side inside a
// withTenant transaction. Public IDs are surfaced separately for the client
// island; secrets never leave the server.
import { withTenant, openCredentials, isSealed } from "@hybrid/db";

/** Plaintext IDs safe to ship to the browser (client Pixel + gtag). */
export interface PublicAnalyticsIds {
  ga4MeasurementId: string | null;
  fbPixelId: string | null;
}

/** Full server-side config: public IDs + opened secrets. Secrets stay server-side. */
export interface AnalyticsConfig extends PublicAnalyticsIds {
  ga4ApiSecret: string | null;
  fbAccessToken: string | null;
  fbTestEventCode: string | null;
  /** Whether the seller has flipped the integration on in Settings. */
  enabled: boolean;
}

interface AnalyticsJson {
  enabled?: boolean;
  ga4MeasurementId?: string;
  fbPixelId?: string;
  fbTestEventCode?: string;
  credentials?: unknown; // sealed { ga4ApiSecret, fbAccessToken }
}

function openIfSealed(credentials: unknown): Record<string, string> {
  if (!isSealed(credentials)) return {};
  try {
    return openCredentials(credentials);
  } catch {
    // A decrypt failure must not crash the caller; treat as "not configured".
    return {};
  }
}

function nonEmpty(v: string | undefined): string | null {
  return v && v.trim() ? v : null;
}

// Read the full config (public IDs + opened secrets) inside a withTenant txn.
// Used by the SERVER fire-path (CAPI + GA4-MP) which needs the secrets.
export async function getAnalyticsConfig(
  tenantId: string,
  userId: string | null,
): Promise<AnalyticsConfig> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ settings: { analytics?: AnalyticsJson } }[]>`
      select settings from tenant where id = ${tenantId} limit 1
    `,
  );
  const a = rows[0]?.settings?.analytics ?? {};
  const creds = openIfSealed(a.credentials);
  return {
    enabled: a.enabled ?? false,
    ga4MeasurementId: nonEmpty(a.ga4MeasurementId),
    fbPixelId: nonEmpty(a.fbPixelId),
    fbTestEventCode: nonEmpty(a.fbTestEventCode),
    ga4ApiSecret: nonEmpty(creds.ga4ApiSecret),
    fbAccessToken: nonEmpty(creds.fbAccessToken),
  };
}

// Read ONLY the public IDs — safe to pass to a client component. Never opens the
// sealed secret envelope, so it can be called on any storefront render.
export async function getPublicAnalyticsIds(
  tenantId: string,
  userId: string | null,
): Promise<PublicAnalyticsIds & { enabled: boolean }> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ settings: { analytics?: AnalyticsJson } }[]>`
      select settings from tenant where id = ${tenantId} limit 1
    `,
  );
  const a = rows[0]?.settings?.analytics ?? {};
  return {
    enabled: a.enabled ?? false,
    ga4MeasurementId: nonEmpty(a.ga4MeasurementId),
    fbPixelId: nonEmpty(a.fbPixelId),
  };
}
