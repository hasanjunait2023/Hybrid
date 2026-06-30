// @hybrid/couriers public types. PURE: fetch + creds injected per-call.

// Same minimal fetch-like contract used across @hybrid integration packages so
// the platform `fetch` (or a stub) can be passed directly.
export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

// Courier credentials (decrypted from courier_account.credentials by the caller).
//
// Steadfast uses {apiKey, secretKey}. Pathao uses an OAuth2 client-credentials +
// password grant {clientId, clientSecret, username, password} and a default
// store + geography. Optional Pathao fields keep existing Steadfast callers
// unaffected (no discriminated union — decision #D).
export interface CourierCreds {
  // Steadfast — required for the steadfast adapter, absent for Pathao.
  apiKey?: string;
  secretKey?: string;
  // Pathao OAuth2 — required for the pathao adapter.
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
  // Pathao default store + geography (Pathao integer IDs as strings).
  storeId?: string;
  cityId?: string;
  zoneId?: string;
  areaId?: string;
}

// Injectable bearer-token cache (Pathao). Backed by Redis in the app
// (key pathao:token:{tenantId}); a Map in tests. get returns null on miss/expiry.
// Mirrors the @hybrid/payments TokenStore so the package stays Redis-free.
export interface TokenStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

// Internal shipment status, decoupled from any single courier's vocabulary.
//   "returned" was added for O7 (NDR handling) so the sync layer can
//   distinguish "delivered" (parcel reached customer) from "returned"
//   (parcel came back without delivery = the NDR state).
export type ShipmentStatus =
  | "created"
  | "in_transit"
  | "delivered"
  | "cancelled"
  | "returned";

// Order-level fulfillment status the storefront/orders surface tracks.
export type OrderFulfillmentStatus =
  | "confirmed"
  | "in_transit"
  | "delivered"
  | "returned";

// What we send to create a consignment. Maps 1:1 onto Steadfast's create_order;
// Pathao additionally needs the geography IDs in `courierArea` (Steadfast ignores
// it). Free-text recipient_address still applies to Steadfast/Pathao item_desc.
export interface ConsignmentInput {
  invoice: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  cod_amount: number; // integer BDT
  note?: string;
  // Pathao/RedX geography IDs (Pathao integer IDs as strings). Optional so
  // existing Steadfast callers are unaffected; overrides the creds defaults.
  courierArea?: { cityId?: string; zoneId?: string; areaId?: string };
  // Parcel weight in kg (Pathao requires a positive weight; defaults to 0.5).
  weight?: number;
}

export interface ConsignmentResult {
  consignmentId: string;
  trackingCode: string;
  raw: unknown;
}

export interface StatusResult {
  status: ShipmentStatus;
  fulfillment: OrderFulfillmentStatus;
  raw: unknown;
}

// The courier provider literal — widened for Phase 2 multi-courier.
export type CourierProvider = "steadfast" | "pathao" | "redx" | "paperfly";

// The courier contract every adapter implements. The provider field is widened
// to the union; each adapter narrows it to its own literal.
export interface CourierAdapter {
  provider: CourierProvider;
  createConsignment(input: ConsignmentInput, creds: CourierCreds): Promise<ConsignmentResult>;
  getStatus(consignmentId: string, creds: CourierCreds): Promise<StatusResult>;
  getBalance(creds: CourierCreds): Promise<number>;
}

// Thrown by adapters that are interface-conformant but not yet wired to a live
// API (RedX/Paperfly — no public docs). Explicit, never a silent fake-success.
export class CourierNotConfiguredError extends Error {
  constructor(public readonly providerName: CourierProvider) {
    super(`COURIER_NOT_CONFIGURED:${providerName}`);
    this.name = "CourierNotConfiguredError";
  }
}
