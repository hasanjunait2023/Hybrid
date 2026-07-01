// Pathao courier adapter. PURE: fetch + creds injected; the bearer-token cache
// is an INJECTED TokenStore (Redis in the app at pathao:token:{tenantId}; a Map
// in tests) so the package never imports Redis. No DB, no Next, no env.
//
// Pathao uses an OAuth2 grant (client-credentials + password) → a bearer token
// (~5h). The adapter grants on first use, caches the access token in the
// TokenStore for its lifetime, and reuses it across calls. The blueprint keeps
// only {client_id, client_secret, username, password} sealed — the token lives in
// Redis only — so no DB write-back is required for the token itself. An optional
// refreshCallback is invoked when a fresh token is minted so a caller MAY persist
// metadata (used by the app to surface "creds invalid" on auth failure).
//
// Create-consignment needs store_id + a three-tier geography (city_id → zone_id →
// area_id) — Pathao integer IDs, the key difference from Steadfast's free-text
// address. getStatus returns an in_transit fallback until a live status endpoint
// is confirmed with a merchant account (documented gap, brief §2.5).
//
//   grant   POST /aladdin/api/v1/issue-token  {client_id, client_secret,
//             grant_type:"password", username, password}
//             -> {access_token, expires_in}
//   create  POST /aladdin/api/v1/orders  (Bearer)  {store_id, merchant_order_id,
//             recipient_name, recipient_phone, recipient_address, recipient_city,
//             recipient_zone, recipient_area, delivery_type:48, item_type:2,
//             item_quantity, item_weight, amount_to_collect, special_instruction}
//             -> {data:{consignment_id, order_status, ...}}
//   status  GET  /aladdin/api/v1/orders/{consignment_id}/info  (Bearer)
//             -> {data:{order_status}}   (fallback in_transit if unavailable)
import type {
  CourierAdapter,
  CourierCreds,
  FetchLike,
  TokenStore,
  ConsignmentInput,
  ConsignmentResult,
  StatusResult,
} from "../types";
import { mapPathaoStatus } from "./statusMap";

const STAGE_BASE = "https://hermes-api.p-stageenv.xyz";
const LIVE_BASE = "https://api-hermes.pathao.com";

// Pathao tokens are valid ~5h; cache slightly under that to avoid edge expiry.
const TOKEN_TTL_SECONDS = 5 * 60 * 60;
const TOKEN_TTL_SAFETY_MARGIN = 120;

// Pathao "Normal" delivery + "Parcel" item defaults.
const DELIVERY_TYPE_NORMAL = 48;
const ITEM_TYPE_PARCEL = 2;
const DEFAULT_WEIGHT_KG = 0.5;

// Invoked when a fresh token is minted. The app MAY use it to record a
// last-refreshed marker; returning void keeps the adapter DB-free.
export type PathaoRefreshCallback = (meta: { accessToken: string; expiresInSeconds: number }) => Promise<void>;

export interface PathaoProviderOptions {
  fetch: FetchLike;
  tokenStore: TokenStore;
  // Cache key namespace, e.g. `pathao:token:${tenantId}`. Composed by the caller
  // so the pure package stays unaware of tenants.
  tokenCacheKey: string;
  // Optional — called on a fresh grant; never required for correctness.
  refreshCallback?: PathaoRefreshCallback;
  // Override the base (default: stage env for contract tests; live when
  // creds.mode === "live" via the per-call selector).
}

export class PathaoProvider implements CourierAdapter {
  readonly provider = "pathao" as const;

  private readonly fetch: FetchLike;
  private readonly tokenStore: TokenStore;
  private readonly tokenCacheKey: string;
  private readonly refreshCallback?: PathaoRefreshCallback;

  constructor(opts: PathaoProviderOptions) {
    this.fetch = opts.fetch;
    this.tokenStore = opts.tokenStore;
    this.tokenCacheKey = opts.tokenCacheKey;
    this.refreshCallback = opts.refreshCallback;
  }

  private baseUrl(creds: CourierCreds): string {
    return creds.clientId && creds.clientSecret && (creds as { mode?: string }).mode === "live"
      ? LIVE_BASE
      : STAGE_BASE;
  }

  private requireCreds(
    creds: CourierCreds,
  ): Required<Pick<CourierCreds, "clientId" | "clientSecret" | "username" | "password">> {
    const { clientId, clientSecret, username, password } = creds;
    if (!clientId || !clientSecret || !username || !password) {
      throw new Error("Pathao credentials incomplete (clientId/clientSecret/username/password required)");
    }
    return { clientId, clientSecret, username, password };
  }

  // Returns a cached bearer token or grants a fresh one. Cached for the token
  // lifetime minus a safety margin so a token never expires mid-request.
  async issueToken(creds: CourierCreds): Promise<string> {
    const cached = await this.tokenStore.get(this.tokenCacheKey);
    if (cached) return cached;

    const { clientId, clientSecret, username, password } = this.requireCreds(creds);

    const res = await this.fetch(`${this.baseUrl(creds)}/aladdin/api/v1/issue-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "password",
        username,
        password,
      }),
    });

    if (!res.ok) {
      throw new Error(`Pathao issue-token HTTP ${res.status}`);
    }
    const body = (await res.json()) as { access_token?: string; expires_in?: number; message?: string };
    if (!body.access_token) {
      throw new Error(`Pathao issue-token failed: ${body.message ?? res.status}`);
    }

    const expiresIn = typeof body.expires_in === "number" ? body.expires_in : TOKEN_TTL_SECONDS;
    const ttl = Math.max(60, expiresIn - TOKEN_TTL_SAFETY_MARGIN);
    await this.tokenStore.set(this.tokenCacheKey, body.access_token, ttl);
    if (this.refreshCallback) {
      await this.refreshCallback({ accessToken: body.access_token, expiresInSeconds: expiresIn });
    }
    return body.access_token;
  }

  private async authedHeaders(creds: CourierCreds): Promise<Record<string, string>> {
    const token = await this.issueToken(creds);
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  async createConsignment(input: ConsignmentInput, creds: CourierCreds): Promise<ConsignmentResult> {
    if (!creds.storeId) {
      throw new Error("Pathao store_id required (set the default store in courier settings)");
    }
    const area = input.courierArea ?? {};
    const cityId = area.cityId ?? creds.cityId;
    const zoneId = area.zoneId ?? creds.zoneId;
    const areaId = area.areaId ?? creds.areaId;
    if (!cityId || !zoneId || !areaId) {
      throw new Error("Pathao geography incomplete (cityId/zoneId/areaId required)");
    }

    const headers = await this.authedHeaders(creds);
    const res = await this.fetch(`${this.baseUrl(creds)}/aladdin/api/v1/orders`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        store_id: Number(creds.storeId),
        merchant_order_id: input.invoice,
        recipient_name: input.recipient_name,
        recipient_phone: input.recipient_phone,
        recipient_address: input.recipient_address,
        recipient_city: Number(cityId),
        recipient_zone: Number(zoneId),
        recipient_area: Number(areaId),
        delivery_type: DELIVERY_TYPE_NORMAL,
        item_type: ITEM_TYPE_PARCEL,
        item_quantity: 1,
        item_weight: input.weight ?? DEFAULT_WEIGHT_KG,
        amount_to_collect: Math.round(input.cod_amount),
        special_instruction: input.note ?? "",
      }),
    });

    if (!res.ok) {
      throw new Error(`Pathao create order HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
      data?: { consignment_id?: string; merchant_order_id?: string; order_status?: string };
      message?: string;
    };

    const consignmentId = body.data?.consignment_id;
    if (!consignmentId) {
      throw new Error(`Pathao create order failed: ${body.message ?? res.status}`);
    }

    return {
      consignmentId: String(consignmentId),
      // Pathao has no separate tracking code; the consignment id IS the tracker.
      trackingCode: String(consignmentId),
      raw: body,
    };
  }

  async getStatus(consignmentId: string, creds: CourierCreds): Promise<StatusResult> {
    const headers = await this.authedHeaders(creds);
    const res = await this.fetch(
      `${this.baseUrl(creds)}/aladdin/api/v1/orders/${consignmentId}/info`,
      { method: "GET", headers },
    );

    if (!res.ok) {
      throw new Error(`Pathao order info HTTP ${res.status}`);
    }
    const body = (await res.json()) as { data?: { order_status?: string } };
    // Fallback to in_transit when the status endpoint is unavailable/undocumented
    // — the parcel is in-network, never wrongly terminalized.
    const mapped = mapPathaoStatus(body.data?.order_status ?? "in_transit");

    return {
      status: mapped.shipment_status,
      fulfillment: mapped.order_fulfillment_status,
      raw: body,
    };
  }

  // Pathao exposes no merchant balance endpoint in the public API. Return 0 so
  // the unified interface holds; the COD/settlement layer is the source of truth.
  async getBalance(_creds: CourierCreds): Promise<number> {
    return 0;
  }
}
