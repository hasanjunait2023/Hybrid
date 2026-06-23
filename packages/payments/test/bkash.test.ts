// ============================================================================
// bKash provider unit suite — stubs the injected fetch and asserts the EXACT
// request URL / headers / body for grant, create, execute, query. Verifies the
// token cache (grant called once across two authed calls) and code mapping.
// ============================================================================
import { describe, it, expect, vi } from "vitest";
import { BkashProvider } from "../src/bkash/provider";
import { MemoryTokenStore } from "../src/bkash/tokenStore";
import type { FetchLike, ProviderCreds } from "../src/types";

const SANDBOX_BASE = "https://tokenized.sandbox.bka.sh/v1.2.0-beta";

const CREDS: ProviderCreds = {
  mode: "sandbox",
  username: "sandboxTokenizedUser02",
  password: "sandboxTokenizedUser02@12345",
  appKey: "4f6o0cjiki2rfm34kfdadl1eqq",
  appSecret: "2is7hdktrekvrbljjh44ll3d9l1dtjo4pasmjvs5vl5qr3fug4b",
};

// Build a fetch stub that returns queued JSON bodies in order and records every
// call (url + init) for exact-shape assertions.
function stubFetch(responses: unknown[]): { fetch: FetchLike; calls: Array<{ url: string; init?: Parameters<FetchLike>[1] }> } {
  const calls: Array<{ url: string; init?: Parameters<FetchLike>[1] }> = [];
  let i = 0;
  const fetch: FetchLike = vi.fn(async (url, init) => {
    calls.push({ url, init });
    const body = responses[i++] ?? {};
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  });
  return { fetch, calls };
}

function makeProvider(fetch: FetchLike) {
  return new BkashProvider({ fetch, tokenStore: new MemoryTokenStore(), tokenCacheKey: "bkash:token:tenant-a" });
}

describe("BkashProvider.grant", () => {
  it("POSTs to the grant endpoint with username/password headers and app_key/app_secret body", async () => {
    const { fetch, calls } = stubFetch([{ id_token: "tok_123", statusCode: "0000" }]);
    const provider = makeProvider(fetch);

    const token = await provider.grant(CREDS);

    expect(token).toBe("tok_123");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${SANDBOX_BASE}/tokenized/checkout/token/grant`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.headers).toMatchObject({
      "Content-Type": "application/json",
      username: CREDS.username!,
      password: CREDS.password!,
    });
    expect(JSON.parse(calls[0]!.init!.body!)).toEqual({
      app_key: CREDS.appKey,
      app_secret: CREDS.appSecret,
    });
  });

  it("caches the token (grant fetched once across two authed calls)", async () => {
    const { fetch, calls } = stubFetch([
      { id_token: "tok_123", statusCode: "0000" },
      { paymentID: "PAY1", bkashURL: "https://pay", statusCode: "0000", transactionStatus: "Initiated" },
      { paymentID: "PAY1", trxID: "TRX1", statusCode: "0000", transactionStatus: "Completed" },
    ]);
    const provider = makeProvider(fetch);

    await provider.createPayment(
      { amount: "100", currency: "BDT", merchantInvoiceNumber: "PAY1", payerReference: "01770618575", callbackURL: "https://cb" },
      CREDS,
    );
    await provider.executePayment({ paymentId: "PAY1" }, CREDS);

    const grantCalls = calls.filter((c) => c.url.endsWith("/token/grant"));
    expect(grantCalls).toHaveLength(1);
  });

  it("throws when grant returns no id_token", async () => {
    const { fetch } = stubFetch([{ statusCode: "9999", statusMessage: "Invalid credentials" }]);
    const provider = makeProvider(fetch);
    await expect(provider.grant(CREDS)).rejects.toThrow(/Invalid credentials/);
  });
});

describe("BkashProvider.createPayment", () => {
  it("sends mode 0001 + sale intent + Authorization/X-App-Key, returns paymentID and bkashURL", async () => {
    const { fetch, calls } = stubFetch([
      { id_token: "tok_123", statusCode: "0000" },
      { paymentID: "PAY777", bkashURL: "https://sandbox.bkash/pay/PAY777", statusCode: "0000", transactionStatus: "Initiated" },
    ]);
    const provider = makeProvider(fetch);

    const result = await provider.createPayment(
      {
        amount: "1250.50",
        currency: "BDT",
        merchantInvoiceNumber: "PAY777",
        payerReference: "01770618575",
        callbackURL: "https://shop.myhybrid.com/api/bkash/callback",
      },
      CREDS,
    );

    expect(result.state).toBe("pending");
    expect(result.paymentId).toBe("PAY777");
    expect(result.redirectUrl).toBe("https://sandbox.bkash/pay/PAY777");

    const createCall = calls.find((c) => c.url.endsWith("/checkout/create"))!;
    expect(createCall.url).toBe(`${SANDBOX_BASE}/tokenized/checkout/create`);
    expect(createCall.init?.headers).toMatchObject({
      Authorization: "tok_123",
      "X-App-Key": CREDS.appKey!,
      "Content-Type": "application/json",
    });
    expect(JSON.parse(createCall.init!.body!)).toEqual({
      mode: "0001",
      payerReference: "01770618575",
      callbackURL: "https://shop.myhybrid.com/api/bkash/callback",
      amount: "1250.50",
      currency: "BDT",
      intent: "sale",
      merchantInvoiceNumber: "PAY777",
    });
  });
});

describe("BkashProvider.executePayment", () => {
  it("POSTs {paymentID} to execute and maps Completed→success with trxID", async () => {
    const { fetch, calls } = stubFetch([
      { id_token: "tok_123", statusCode: "0000" },
      { paymentID: "PAY777", trxID: "TRX999", statusCode: "0000", transactionStatus: "Completed" },
    ]);
    const provider = makeProvider(fetch);

    const result = await provider.executePayment({ paymentId: "PAY777" }, CREDS);

    expect(result.state).toBe("success");
    expect(result.trxId).toBe("TRX999");

    const execCall = calls.find((c) => c.url.endsWith("/checkout/execute"))!;
    expect(execCall.url).toBe(`${SANDBOX_BASE}/tokenized/checkout/execute`);
    expect(JSON.parse(execCall.init!.body!)).toEqual({ paymentID: "PAY777" });
  });

  it("maps a Failed execute to the failed state", async () => {
    const { fetch } = stubFetch([
      { id_token: "tok_123", statusCode: "0000" },
      { paymentID: "PAY777", statusCode: "0000", transactionStatus: "Failed" },
    ]);
    const provider = makeProvider(fetch);
    const result = await provider.executePayment({ paymentId: "PAY777" }, CREDS);
    expect(result.state).toBe("failed");
  });
});

describe("BkashProvider.queryPayment", () => {
  it("POSTs {paymentID} to payment/status as the safety net", async () => {
    const { fetch, calls } = stubFetch([
      { id_token: "tok_123", statusCode: "0000" },
      { paymentID: "PAY777", trxID: "TRX999", statusCode: "0000", transactionStatus: "Completed" },
    ]);
    const provider = makeProvider(fetch);

    const result = await provider.queryPayment({ paymentId: "PAY777" }, CREDS);

    expect(result.state).toBe("success");
    expect(result.trxId).toBe("TRX999");
    const queryCall = calls.find((c) => c.url.endsWith("/checkout/payment/status"))!;
    expect(queryCall.url).toBe(`${SANDBOX_BASE}/tokenized/checkout/payment/status`);
    expect(JSON.parse(queryCall.init!.body!)).toEqual({ paymentID: "PAY777" });
  });
});

describe("BkashProvider.refund", () => {
  it("POSTs the documented refund body and maps 0000→refunded", async () => {
    const { fetch, calls } = stubFetch([
      { id_token: "tok_123", statusCode: "0000" },
      { statusCode: "0000", refundTrxID: "RF1" },
    ]);
    const provider = makeProvider(fetch);

    const result = await provider.refund!(
      { paymentId: "PAY777", trxId: "TRX999", amount: "100", reason: "customer request", sku: "ORDER-1" },
      CREDS,
    );

    expect(result.state).toBe("refunded");
    const refundCall = calls.find((c) => c.url.endsWith("/payment/refund"))!;
    expect(refundCall.url).toBe(`${SANDBOX_BASE}/tokenized/checkout/payment/refund`);
    expect(JSON.parse(refundCall.init!.body!)).toEqual({
      paymentID: "PAY777",
      trxID: "TRX999",
      amount: "100",
      reason: "customer request",
      sku: "ORDER-1",
    });
  });
});

describe("BkashProvider live URL", () => {
  it("uses the live base when creds.mode === 'live'", async () => {
    const { fetch, calls } = stubFetch([{ id_token: "tok_live", statusCode: "0000" }]);
    const provider = makeProvider(fetch);
    await provider.grant({ ...CREDS, mode: "live" });
    expect(calls[0]!.url).toBe("https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout/token/grant");
  });
});
