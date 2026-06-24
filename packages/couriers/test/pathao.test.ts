// ============================================================================
// Pathao adapter contract suite — stubs the injected fetch + an in-memory
// TokenStore. Asserts OAuth2 issue-token, token caching (granted once across two
// authed calls), the create-order body with city/zone/area IDs, and the status
// fallback. Runs against the stage base; no merchant account needed.
// ============================================================================
import { describe, it, expect, vi } from "vitest";
import { PathaoProvider } from "../src/pathao/provider";
import { mapPathaoStatus, KNOWN_PATHAO_STATUSES } from "../src/pathao/statusMap";
import type { FetchLike, CourierCreds, TokenStore } from "../src/types";

const STAGE_BASE = "https://hermes-api.p-stageenv.xyz";

const CREDS: CourierCreds = {
  clientId: "client_xyz",
  clientSecret: "secret_xyz",
  username: "merchant@store.com",
  password: "pw12345",
  storeId: "1024",
  cityId: "1",
  zoneId: "298",
  areaId: "5621",
};

class MapTokenStore implements TokenStore {
  private readonly map = new Map<string, { value: string; exp: number }>();
  async get(key: string): Promise<string | null> {
    const e = this.map.get(key);
    if (!e || Date.now() >= e.exp) return null;
    return e.value;
  }
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.map.set(key, { value, exp: Date.now() + ttlSeconds * 1000 });
  }
}

function stubFetch(responses: unknown[]): {
  fetch: FetchLike;
  calls: Array<{ url: string; init?: Parameters<FetchLike>[1] }>;
} {
  const calls: Array<{ url: string; init?: Parameters<FetchLike>[1] }> = [];
  let i = 0;
  const fetch: FetchLike = vi.fn(async (url, init) => {
    calls.push({ url, init });
    const body = responses[i++] ?? {};
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  });
  return { fetch, calls };
}

function makeProvider(fetch: FetchLike, refreshCallback?: PathaoCb) {
  return new PathaoProvider({
    fetch,
    tokenStore: new MapTokenStore(),
    tokenCacheKey: "pathao:token:tenant-a",
    refreshCallback,
  });
}
type PathaoCb = (m: { accessToken: string; expiresInSeconds: number }) => Promise<void>;

const CONSIGNMENT_INPUT = {
  invoice: "ORDER-1001",
  recipient_name: "Rahim Uddin",
  recipient_phone: "01700000000",
  recipient_address: "House 1, Road 2, Dhaka",
  cod_amount: 1250.5,
  note: "Handle with care",
};

describe("PathaoProvider.issueToken", () => {
  it("POSTs issue-token with the password grant body and returns the access token", async () => {
    const { fetch, calls } = stubFetch([{ access_token: "BEARER1", expires_in: 18000 }]);
    const provider = makeProvider(fetch);

    const token = await provider.issueToken(CREDS);

    expect(token).toBe("BEARER1");
    expect(calls[0]!.url).toBe(`${STAGE_BASE}/aladdin/api/v1/issue-token`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(calls[0]!.init!.body!)).toEqual({
      client_id: "client_xyz",
      client_secret: "secret_xyz",
      grant_type: "password",
      username: "merchant@store.com",
      password: "pw12345",
    });
  });

  it("caches the token (issue-token called once across two authed calls)", async () => {
    const { fetch, calls } = stubFetch([
      { access_token: "BEARER1", expires_in: 18000 },
      { data: { consignment_id: "DA240101ABCDE" } },
      { data: { order_status: "Delivered" } },
    ]);
    const provider = makeProvider(fetch);

    await provider.createConsignment(CONSIGNMENT_INPUT, CREDS);
    await provider.getStatus("DA240101ABCDE", CREDS);

    const tokenCalls = calls.filter((c) => c.url.endsWith("/issue-token"));
    expect(tokenCalls).toHaveLength(1);
  });

  it("invokes refreshCallback on a fresh grant", async () => {
    const { fetch } = stubFetch([{ access_token: "BEARER1", expires_in: 18000 }]);
    const cb = vi.fn(async () => {});
    const provider = makeProvider(fetch, cb);
    await provider.issueToken(CREDS);
    expect(cb).toHaveBeenCalledWith({ accessToken: "BEARER1", expiresInSeconds: 18000 });
  });

  it("throws when issue-token returns no access_token", async () => {
    const { fetch } = stubFetch([{ message: "invalid client" }]);
    const provider = makeProvider(fetch);
    await expect(provider.issueToken(CREDS)).rejects.toThrow(/Pathao issue-token failed/);
  });
});

describe("PathaoProvider.createConsignment", () => {
  it("sends store_id + city/zone/area IDs and integer amount_to_collect", async () => {
    const { fetch, calls } = stubFetch([
      { access_token: "BEARER1", expires_in: 18000 },
      { data: { consignment_id: "DA240101ABCDE", order_status: "Pending" } },
    ]);
    const provider = makeProvider(fetch);

    const result = await provider.createConsignment(CONSIGNMENT_INPUT, CREDS);

    expect(result.consignmentId).toBe("DA240101ABCDE");
    expect(result.trackingCode).toBe("DA240101ABCDE");

    const createCall = calls.find((c) => c.url.endsWith("/orders"))!;
    expect(createCall.url).toBe(`${STAGE_BASE}/aladdin/api/v1/orders`);
    expect(createCall.init?.headers).toMatchObject({ Authorization: "Bearer BEARER1" });
    const body = JSON.parse(createCall.init!.body!);
    expect(body.store_id).toBe(1024);
    expect(body.merchant_order_id).toBe("ORDER-1001");
    expect(body.recipient_city).toBe(1);
    expect(body.recipient_zone).toBe(298);
    expect(body.recipient_area).toBe(5621);
    expect(body.amount_to_collect).toBe(1251); // rounded from 1250.5
  });

  it("lets courierArea on the input override the creds geography defaults", async () => {
    const { fetch, calls } = stubFetch([
      { access_token: "BEARER1", expires_in: 18000 },
      { data: { consignment_id: "C2" } },
    ]);
    const provider = makeProvider(fetch);

    await provider.createConsignment(
      { ...CONSIGNMENT_INPUT, courierArea: { cityId: "9", zoneId: "100", areaId: "200" } },
      CREDS,
    );

    const body = JSON.parse(calls.find((c) => c.url.endsWith("/orders"))!.init!.body!);
    expect(body.recipient_city).toBe(9);
    expect(body.recipient_zone).toBe(100);
    expect(body.recipient_area).toBe(200);
  });

  it("throws when geography is incomplete", async () => {
    const { fetch } = stubFetch([{ access_token: "B", expires_in: 18000 }]);
    const provider = makeProvider(fetch);
    await expect(
      provider.createConsignment(
        { ...CONSIGNMENT_INPUT, courierArea: {} },
        { ...CREDS, cityId: undefined, zoneId: undefined, areaId: undefined },
      ),
    ).rejects.toThrow(/Pathao geography incomplete/);
  });

  it("throws when store_id is missing", async () => {
    const { fetch } = stubFetch([]);
    const provider = makeProvider(fetch);
    await expect(
      provider.createConsignment(CONSIGNMENT_INPUT, { ...CREDS, storeId: undefined }),
    ).rejects.toThrow(/Pathao store_id required/);
  });

  it("throws when create order returns no consignment_id", async () => {
    const { fetch } = stubFetch([
      { access_token: "BEARER1", expires_in: 18000 },
      { message: "invalid zone" },
    ]);
    const provider = makeProvider(fetch);
    await expect(provider.createConsignment(CONSIGNMENT_INPUT, CREDS)).rejects.toThrow(
      /Pathao create order failed/,
    );
  });
});

describe("PathaoProvider.getStatus", () => {
  it("GETs the order info endpoint and maps order_status", async () => {
    const { fetch, calls } = stubFetch([
      { access_token: "BEARER1", expires_in: 18000 },
      { data: { order_status: "Delivered" } },
    ]);
    const provider = makeProvider(fetch);

    const result = await provider.getStatus("DA240101ABCDE", CREDS);

    const statusCall = calls.find((c) => c.url.includes("/info"))!;
    expect(statusCall.url).toBe(`${STAGE_BASE}/aladdin/api/v1/orders/DA240101ABCDE/info`);
    expect(result.status).toBe("delivered");
    expect(result.fulfillment).toBe("delivered");
  });

  it("falls back to in_transit when order_status is absent", async () => {
    const { fetch } = stubFetch([
      { access_token: "BEARER1", expires_in: 18000 },
      { data: {} },
    ]);
    const provider = makeProvider(fetch);
    const result = await provider.getStatus("C", CREDS);
    expect(result.status).toBe("in_transit");
    expect(result.fulfillment).toBe("in_transit");
  });
});

describe("PathaoProvider.getBalance", () => {
  it("returns 0 (Pathao has no public balance endpoint)", async () => {
    const { fetch } = stubFetch([]);
    const provider = makeProvider(fetch);
    expect(await provider.getBalance(CREDS)).toBe(0);
  });
});

describe("mapPathaoStatus", () => {
  it("maps known statuses and normalizes spacing/casing", () => {
    expect(mapPathaoStatus("Delivered").shipment_status).toBe("delivered");
    expect(mapPathaoStatus("In Transit").shipment_status).toBe("in_transit");
    expect(mapPathaoStatus("Pickup_Requested").shipment_status).toBe("created");
    expect(mapPathaoStatus("Returned").shipment_status).toBe("cancelled");
  });

  it("unknown status falls back to in_transit", () => {
    expect(mapPathaoStatus("something_new").shipment_status).toBe("in_transit");
  });

  it("exports the known status set", () => {
    expect(KNOWN_PATHAO_STATUSES).toContain("delivered");
    expect(KNOWN_PATHAO_STATUSES.length).toBeGreaterThan(5);
  });
});
