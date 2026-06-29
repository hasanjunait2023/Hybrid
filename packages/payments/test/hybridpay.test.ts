import { describe, it, expect } from "vitest";
import { HybridpayProvider } from "../src/hybridpay/provider";
import { mapHybridpayState } from "../src/hybridpay/codes";
import type { FetchLike, ProviderCreds } from "../src/types";

const creds: ProviderCreds = {
  mode: "live",
  apiKey: "tenant-api-key",
  baseUrl: "https://pay.hybrid.ecomex.cloud/",
};

// A fetch stub that records the last request and returns a canned JSON body.
function stubFetch(body: unknown): { fetch: FetchLike; calls: { url: string; init?: Parameters<FetchLike>[1] }[] } {
  const calls: { url: string; init?: Parameters<FetchLike>[1] }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  return { fetch, calls };
}

describe("mapHybridpayState", () => {
  it("maps completed to success and refunded to refunded", () => {
    expect(mapHybridpayState("completed")).toBe("success");
    expect(mapHybridpayState("refunded")).toBe("refunded");
  });

  it("maps pending/cancelled through, unknown to failed", () => {
    expect(mapHybridpayState("pending")).toBe("pending");
    expect(mapHybridpayState("cancelled")).toBe("cancelled");
    expect(mapHybridpayState("garbage")).toBe("failed");
    expect(mapHybridpayState(undefined)).toBe("failed");
  });
});

describe("HybridpayProvider.createPayment", () => {
  it("posts to /api/checkout/redirect with the api-key header and returns pp_url", async () => {
    const { fetch, calls } = stubFetch({ pp_id: "PP123", pp_url: "https://pay.x/redirect/PP123" });
    const provider = new HybridpayProvider({ fetch });

    const res = await provider.createPayment(
      {
        amount: "1250.50",
        currency: "BDT",
        merchantInvoiceNumber: "order-1",
        payerReference: "01700000000",
        callbackURL: "https://store-a.example.com/api/hybridpay/webhook",
      },
      creds,
    );

    expect(res.state).toBe("pending");
    expect(res.paymentId).toBe("PP123");
    expect(res.redirectUrl).toBe("https://pay.x/redirect/PP123");

    // trailing slash on baseUrl is stripped; header carries the tenant key.
    expect(calls[0].url).toBe("https://pay.hybrid.ecomex.cloud/api/checkout/redirect");
    expect(calls[0].init?.headers?.["mhs-piprapay-api-key"]).toBe("tenant-api-key");
    const sent = JSON.parse(calls[0].init?.body as string);
    expect(sent.amount).toBe("1250.50");
    expect(sent.mobile_number).toBe("01700000000");
    expect(sent.metadata.invoice_id).toBe("order-1");
  });

  it("throws when no pp_url is returned", async () => {
    const { fetch } = stubFetch({ error: { message: "domain not whitelisted" } });
    const provider = new HybridpayProvider({ fetch });
    await expect(
      provider.createPayment(
        { amount: "10", currency: "BDT", merchantInvoiceNumber: "o", payerReference: "01", callbackURL: "https://x/cb" },
        creds,
      ),
    ).rejects.toThrow(/domain not whitelisted/);
  });

  it("requires apiKey and baseUrl", async () => {
    const { fetch } = stubFetch({});
    const provider = new HybridpayProvider({ fetch });
    await expect(
      provider.createPayment(
        { amount: "10", currency: "BDT", merchantInvoiceNumber: "o", payerReference: "01", callbackURL: "https://x/cb" },
        { mode: "live" },
      ),
    ).rejects.toThrow(/credentials incomplete/);
  });
});

describe("HybridpayProvider.executePayment (verify)", () => {
  it("verifies by pp_id and returns settled amount + trxId", async () => {
    const { fetch, calls } = stubFetch({
      status: "completed",
      amount: 1250.5,
      transaction_id: "TRX-9",
      pp_id: "PP123",
    });
    const provider = new HybridpayProvider({ fetch });

    const res = await provider.executePayment({ paymentId: "PP123" }, creds);

    expect(res.state).toBe("success");
    expect(res.trxId).toBe("TRX-9");
    expect(res.amount).toBe("1250.5"); // numeric coerced to string for exact match
    expect(calls[0].url).toBe("https://pay.hybrid.ecomex.cloud/api/verify-payment");
    expect(JSON.parse(calls[0].init?.body as string).pp_id).toBe("PP123");
  });

  it("maps an unknown/failed verify status to failed", async () => {
    const { fetch } = stubFetch({ status: "error" });
    const provider = new HybridpayProvider({ fetch });
    const res = await provider.queryPayment({ paymentId: "PPx" }, creds);
    expect(res.state).toBe("failed");
    expect(res.amount).toBeUndefined();
  });
});
