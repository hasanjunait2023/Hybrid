// ============================================================================
// Nagad provider contract suite — stubs the injected fetch and asserts the
// initialize → complete → verify flow, exact URLs, and RSA-sealed envelope
// shape. Uses a real ephemeral RSA keypair so publicEncrypt/sign run for real
// (the package is pure node:crypto, no DB/Next). No sandbox account needed.
// ============================================================================
import { describe, it, expect, vi, beforeAll } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { NagadProvider } from "../src/nagad/provider";
import { mapNagadState } from "../src/nagad/codes";
import type { FetchLike, ProviderCreds } from "../src/types";

const SANDBOX_BASE = "https://sandbox.mynagad.com:10060/remote-payment-gateway-1.0/api/dfs";

let CREDS: ProviderCreds;

beforeAll(() => {
  // Merchant signs with its private key; Nagad's public key encrypts sensitive
  // data. For the unit test both keys are ephemeral — only the call shapes matter.
  const merchant = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const nagad = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  CREDS = {
    mode: "sandbox",
    merchantId: "683002007104225",
    merchantPrivateKey: merchant.privateKey,
    nagadPublicKey: nagad.publicKey,
  };
});

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

const CREATE_INPUT = {
  amount: "1250.50",
  currency: "BDT" as const,
  merchantInvoiceNumber: "ORDER-1001",
  payerReference: "01770618575",
  callbackURL: "https://shop.myhybrid.com/api/payments/nagad/callback",
};

describe("NagadProvider.createPayment", () => {
  it("initializes then completes, sealing sensitiveData + signature, and returns the callback URL", async () => {
    const { fetch, calls } = stubFetch([
      { paymentReferenceId: "MTIzNDU2Nzg5", challenge: "SVR_CHAL", status: "Success" },
      { status: "Success", callBackUrl: "https://api.mynagad.com/check-out/PRef" },
    ]);
    const provider = new NagadProvider({ fetch });

    const result = await provider.createPayment(CREATE_INPUT, CREDS);

    expect(result.state).toBe("success");
    expect(result.paymentId).toBe("MTIzNDU2Nzg5");
    expect(result.redirectUrl).toBe("https://api.mynagad.com/check-out/PRef");

    // initialize URL is /check-out/initialize/{merchantId}/{orderId}
    expect(calls[0]!.url).toBe(`${SANDBOX_BASE}/check-out/initialize/${CREDS.merchantId}/ORDER-1001`);
    expect(calls[0]!.init?.method).toBe("POST");
    const initBody = JSON.parse(calls[0]!.init!.body!);
    expect(typeof initBody.sensitiveData).toBe("string");
    expect(typeof initBody.signature).toBe("string");
    expect(initBody.sensitiveData.length).toBeGreaterThan(0);

    // complete URL is /check-out/complete/{paymentReferenceId}
    expect(calls[1]!.url).toBe(`${SANDBOX_BASE}/check-out/complete/MTIzNDU2Nzg5`);
    const completeBody = JSON.parse(calls[1]!.init!.body!);
    expect(completeBody.merchantCallbackURL).toBe(CREATE_INPUT.callbackURL);
    expect(typeof completeBody.sensitiveData).toBe("string");
    expect(typeof completeBody.signature).toBe("string");
  });

  it("throws when initialize returns no paymentReferenceId", async () => {
    const { fetch } = stubFetch([{ status: "Failed", reason: "Invalid merchant" }]);
    const provider = new NagadProvider({ fetch });
    await expect(provider.createPayment(CREATE_INPUT, CREDS)).rejects.toThrow(/Nagad initialize failed/);
  });

  it("throws when complete returns no callBackUrl", async () => {
    const { fetch } = stubFetch([
      { paymentReferenceId: "REF", challenge: "C" },
      { status: "Aborted", reason: "User aborted" },
    ]);
    const provider = new NagadProvider({ fetch });
    await expect(provider.createPayment(CREATE_INPUT, CREDS)).rejects.toThrow(/Nagad complete failed/);
  });

  it("throws on incomplete creds (missing keys)", async () => {
    const { fetch } = stubFetch([]);
    const provider = new NagadProvider({ fetch });
    await expect(
      provider.createPayment(CREATE_INPUT, { mode: "sandbox", merchantId: "x" }),
    ).rejects.toThrow(/Nagad credentials incomplete/);
  });
});

describe("NagadProvider.executePayment / queryPayment", () => {
  it("verifies by reference id and returns the settled amount for the amount-match", async () => {
    const { fetch, calls } = stubFetch([
      { status: "Success", statusCode: "000", issuerPaymentRefNo: "TXN999", amount: "1250.50" },
    ]);
    const provider = new NagadProvider({ fetch });

    const result = await provider.executePayment({ paymentId: "MTIzNDU2Nzg5" }, CREDS);

    expect(calls[0]!.url).toBe(`${SANDBOX_BASE}/verify/payment/MTIzNDU2Nzg5`);
    expect(calls[0]!.init?.method).toBe("GET");
    expect(result.state).toBe("success");
    expect(result.trxId).toBe("TXN999");
    expect(result.amount).toBe("1250.50");
  });

  it("maps a Failed verify to the failed state", async () => {
    const { fetch } = stubFetch([{ status: "Failed" }]);
    const provider = new NagadProvider({ fetch });
    const result = await provider.queryPayment({ paymentId: "REF" }, CREDS);
    expect(result.state).toBe("failed");
  });
});

describe("NagadProvider live URL", () => {
  it("uses the live base when creds.mode === 'live'", async () => {
    const { fetch, calls } = stubFetch([{ status: "Success" }]);
    const provider = new NagadProvider({ fetch });
    await provider.queryPayment({ paymentId: "REF" }, { ...CREDS, mode: "live" });
    expect(calls[0]!.url).toBe("https://api.mynagad.com/api/dfs/verify/payment/REF");
  });
});

describe("mapNagadState", () => {
  it("maps Success→success, Aborted/Cancelled→cancelled, Failed→failed, undefined→pending", () => {
    expect(mapNagadState({ status: "Success" })).toBe("success");
    expect(mapNagadState({ status: "Aborted" })).toBe("cancelled");
    expect(mapNagadState({ status: "Cancelled" })).toBe("cancelled");
    expect(mapNagadState({ status: "Failed" })).toBe("failed");
    expect(mapNagadState({})).toBe("pending");
    expect(mapNagadState({ status: "Weird" })).toBe("failed");
  });
});
