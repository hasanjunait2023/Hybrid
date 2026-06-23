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
export interface CourierCreds {
  apiKey: string;
  secretKey: string;
}

// Internal shipment status, decoupled from any single courier's vocabulary.
export type ShipmentStatus =
  | "created"
  | "in_transit"
  | "delivered"
  | "cancelled";

// Order-level fulfillment status the storefront/orders surface tracks.
export type OrderFulfillmentStatus =
  | "confirmed"
  | "in_transit"
  | "delivered"
  | "returned";

// What we send to create a consignment. Maps 1:1 onto Steadfast's create_order.
export interface ConsignmentInput {
  invoice: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  cod_amount: number; // integer BDT
  note?: string;
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

// The courier contract every adapter implements.
export interface CourierAdapter {
  provider: "steadfast";
  createConsignment(input: ConsignmentInput, creds: CourierCreds): Promise<ConsignmentResult>;
  getStatus(consignmentId: string, creds: CourierCreds): Promise<StatusResult>;
  getBalance(creds: CourierCreds): Promise<number>;
}
