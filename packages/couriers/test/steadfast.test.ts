// ============================================================================
// Steadfast adapter contract suite — stubs the injected fetch and asserts the
// EXACT request URL / headers / body for create_order, status_by_cid, and
// get_balance against the documented shapes. NO sandbox exists; live
// verification is deferred to a merchant account.
// ============================================================================
import { describe, it, expect, vi } from "vitest";
import { SteadfastProvider } from "../src/steadfast";
import type { FetchLike, CourierCreds } from "../src/types";

const BASE = "https://portal.steadfast.com.bd/api/v1";

const CREDS: CourierCreds = { apiKey: "test_api_key", secretKey: "test_secret_key" };

function stubFetch(response: unknown): { fetch: FetchLike; calls: Array<{ url: string; init?: Parameters<FetchLike>[1] }> } {
  const calls: Array<{ url: string; init?: Parameters<FetchLike>[1] }> = [];
  const fetch: FetchLike = vi.fn(async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => response,
      text: async () => JSON.stringify(response),
    };
  });
  return { fetch, calls };
}

describe("SteadfastProvider.createConsignment", () => {
  it("POSTs the exact create_order body with Api-Key/Secret-Key headers", async () => {
    const { fetch, calls } = stubFetch({
      status: 200,
      message: "Consignment has been created successfully.",
      consignment: { consignment_id: 1424107, tracking_code: "15BAEB", status: "in_review" },
    });
    const provider = new SteadfastProvider({ fetch });

    const result = await provider.createConsignment(
      {
        invoice: "ORDER-1001",
        recipient_name: "Rahim Uddin",
        recipient_phone: "01700000000",
        recipient_address: "House 1, Road 2, Dhaka",
        cod_amount: 1250,
        note: "Handle with care",
      },
      CREDS,
    );

    expect(result.consignmentId).toBe("1424107");
    expect(result.trackingCode).toBe("15BAEB");

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${BASE}/create_order`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.headers).toEqual({
      "Api-Key": "test_api_key",
      "Secret-Key": "test_secret_key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(calls[0]!.init!.body!)).toEqual({
      invoice: "ORDER-1001",
      recipient_name: "Rahim Uddin",
      recipient_phone: "01700000000",
      recipient_address: "House 1, Road 2, Dhaka",
      cod_amount: 1250,
      note: "Handle with care",
    });
  });

  it("coerces cod_amount to an integer and defaults note to empty string", async () => {
    const { fetch, calls } = stubFetch({
      consignment: { consignment_id: 1, tracking_code: "ABC" },
    });
    const provider = new SteadfastProvider({ fetch });

    await provider.createConsignment(
      {
        invoice: "ORDER-2",
        recipient_name: "X",
        recipient_phone: "01800000000",
        recipient_address: "addr",
        cod_amount: 999.7,
      },
      CREDS,
    );

    const sent = JSON.parse(calls[0]!.init!.body!);
    expect(sent.cod_amount).toBe(1000);
    expect(sent.note).toBe("");
  });

  it("throws when the response carries no consignment", async () => {
    const { fetch } = stubFetch({ status: 400, message: "The recipient phone must be 11 characters." });
    const provider = new SteadfastProvider({ fetch });
    await expect(
      provider.createConsignment(
        { invoice: "X", recipient_name: "X", recipient_phone: "bad", recipient_address: "a", cod_amount: 1 },
        CREDS,
      ),
    ).rejects.toThrow(/Steadfast create_order failed/);
  });
});

describe("SteadfastProvider.getStatus", () => {
  it("GETs status_by_cid/{id} and maps delivery_status", async () => {
    const { fetch, calls } = stubFetch({ status: 200, delivery_status: "delivered" });
    const provider = new SteadfastProvider({ fetch });

    const result = await provider.getStatus("1424107", CREDS);

    expect(calls[0]!.url).toBe(`${BASE}/status_by_cid/1424107`);
    expect(calls[0]!.init?.method).toBe("GET");
    expect(calls[0]!.init?.headers).toEqual({
      "Api-Key": "test_api_key",
      "Secret-Key": "test_secret_key",
      "Content-Type": "application/json",
    });
    expect(result.status).toBe("delivered");
    expect(result.fulfillment).toBe("delivered");
  });
});

describe("SteadfastProvider.getBalance", () => {
  it("GETs get_balance and returns current_balance", async () => {
    const { fetch, calls } = stubFetch({ status: 200, current_balance: 3500.5 });
    const provider = new SteadfastProvider({ fetch });

    const balance = await provider.getBalance(CREDS);

    expect(calls[0]!.url).toBe(`${BASE}/get_balance`);
    expect(calls[0]!.init?.method).toBe("GET");
    expect(balance).toBe(3500.5);
  });
});
