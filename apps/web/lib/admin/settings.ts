// Settings read layer (blueprint S-SETTINGS 1.10). All reads via withTenant (RLS).
//
// The cardinal rule: these helpers NEVER return raw secrets. A settings page
// renders only "is it enabled / configured" booleans plus a masked tail hint
// (last 4 chars) so the seller can recognize which key is saved without the
// value ever leaving the server in plaintext. The sealed envelope is opened
// only inside the Server Action that needs to *use* a credential (the courier
// wiring / a future test button), never for display.
import { withTenant, openCredentials, isSealed } from "@hybrid/db";

// ---- Masking ---------------------------------------------------------------
// Show only the last 4 chars of a saved secret (e.g. "••••••3d9l"), never the
// head. A short secret is fully masked. Used for the "this key is set" hint.
function maskTail(value: string | undefined): string | null {
  if (!value) return null;
  const tail = value.slice(-4);
  return value.length <= 4 ? "••••" : `••••${tail}`;
}

// Open a sealed credentials jsonb to its plaintext map, ONLY to derive masked
// hints here. Returns {} if the column is empty or not a sealed envelope (e.g.
// a freshly-created row before configuration).
function openIfSealed(credentials: unknown): Record<string, string> {
  if (!isSealed(credentials)) return {};
  try {
    return openCredentials(credentials);
  } catch {
    // A decrypt failure (wrong key / tampered) must not crash the settings page;
    // treat it as "not configured" rather than leaking the error to the UI.
    return {};
  }
}

// ---- Payments --------------------------------------------------------------
export interface BkashSettings {
  enabled: boolean;
  /** true once app_key/app_secret/username/password are all sealed. */
  configured: boolean;
  mode: "sandbox" | "live";
  usernameHint: string | null;
  appKeyHint: string | null;
}

export interface CodSettings {
  enabled: boolean;
}

export interface PaymentSettings {
  bkash: BkashSettings;
  cod: CodSettings;
}

export async function getPaymentSettings(
  tenantId: string,
  userId: string,
): Promise<PaymentSettings> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ provider: string; is_enabled: boolean; credentials: unknown }[]>`
      select provider, is_enabled, credentials
      from payment_account
      where provider in ('bkash', 'cod')
    `,
  );

  const bkashRow = rows.find((r) => r.provider === "bkash");
  const codRow = rows.find((r) => r.provider === "cod");

  const bkashCreds = openIfSealed(bkashRow?.credentials);
  const configured =
    Boolean(bkashCreds.appKey) &&
    Boolean(bkashCreds.appSecret) &&
    Boolean(bkashCreds.username) &&
    Boolean(bkashCreds.password);

  return {
    bkash: {
      enabled: bkashRow?.is_enabled ?? false,
      configured,
      mode: bkashCreds.mode === "live" ? "live" : "sandbox",
      usernameHint: maskTail(bkashCreds.username),
      appKeyHint: maskTail(bkashCreds.appKey),
    },
    // COD is the market default (DESIGN §P6): on unless a row explicitly disables
    // it. No row yet → enabled.
    cod: { enabled: codRow ? codRow.is_enabled : true },
  };
}

// ---- Courier (Steadfast) ---------------------------------------------------
export interface CourierSettings {
  enabled: boolean;
  /** true once apiKey + secretKey are sealed. */
  configured: boolean;
  apiKeyHint: string | null;
}

export async function getCourierSettings(
  tenantId: string,
  userId: string,
): Promise<CourierSettings> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ is_enabled: boolean; credentials: unknown }[]>`
      select is_enabled, credentials
      from courier_account
      where provider = 'steadfast'
      limit 1
    `,
  );
  const row = rows[0];
  const creds = openIfSealed(row?.credentials);

  return {
    enabled: row?.is_enabled ?? false,
    configured: Boolean(creds.apiKey) && Boolean(creds.secretKey),
    apiKeyHint: maskTail(creds.apiKey),
  };
}

// ---- Store profile ---------------------------------------------------------
// Stored in tenant.settings jsonb (not a credentials column — no encryption).
export interface StoreProfile {
  name: string;
  phone: string;
  facebook: string;
  address: string;
  returnPolicy: string;
  vatBin: string;
  /** The verified primary subdomain, shown read-only (DESIGN §P6). */
  subdomain: string | null;
}

interface TenantSettingsJson {
  contact?: { phone?: string; address?: string };
  social?: { facebook?: string };
  policies?: { returns?: string };
  vatBin?: string;
}

export async function getStoreProfile(
  tenantId: string,
  userId: string,
): Promise<StoreProfile> {
  return withTenant(tenantId, userId, async (tx) => {
    const rows = await tx<{ name: string; settings: TenantSettingsJson }[]>`
      select name, settings from tenant where id = ${tenantId} limit 1
    `;
    const row = rows[0];
    const settings = row?.settings ?? {};

    const domains = await tx<{ domain: string }[]>`
      select domain from tenant_domain
      where type = 'subdomain' and is_primary = true
      order by verified desc, created_at asc
      limit 1
    `;

    return {
      name: row?.name ?? "",
      phone: settings.contact?.phone ?? "",
      facebook: settings.social?.facebook ?? "",
      address: settings.contact?.address ?? "",
      returnPolicy: settings.policies?.returns ?? "",
      vatBin: settings.vatBin ?? "",
      subdomain: domains[0]?.domain ?? null,
    };
  });
}
