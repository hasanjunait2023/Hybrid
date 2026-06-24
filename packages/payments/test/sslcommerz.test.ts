// ============================================================================
// SSLCommerz provider contract suite — stubs the injected fetch and asserts the
// session-create (form-urlencoded) → validate-by-val_id flow, exact URLs, and
// the form fields SSLCommerz requires. No sandbox account needed.
// ============================================================================
import { describe, it, expect, vi } from "vitest";
import { SslcommerzProvider } from "../src/sslcommerz/provider";
import { mapSslcommerzTxnState, mapSslcommerzInitState } from "../src/sslcommerz/codes";
import type { FetchLike, ProviderCreds } from "../src/types";

const SANDBOX_BASE = "https://sandbox.sslcommerz.com";

const CREDS: ProviderCreds = {
  mode: "sandbox",
  storeId: "testbox",
  storePassword: "qwerty",
};

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
  callbackURL: "https://shop.myhybrid.com/api/payments/sslcommerz/ipn",
};

describe("SslcommerzProvider.createPayment", () => {
  it("POSTs the form-urlencoded session body and returns GatewayPageURL", async () => {
    const { fetch, calls } = stubFetch([
      { status: "SUCCESS", GatewayPageURL: "https://sandbox.sslcommerz.com/EasyCheckOut/abc", sessionkey: "SK1" },
    ]);
    const provider = new SslcommerzProvider({ fetch });

    const result = await provider.createPayment(CREATE_INPUT, CREDS);

    expect(result.state).toBe("pending");
    expect(result.paymentId).toBe("ORDER-1001");
    expect(result.redirectUrl).toBe("https://sandbox.sslcommerz.com/EasyCheckOut/abc");

    expect(calls[0]!.url).toBe(`${SANDBOX_BASE}/gwprocess/v4/api.php`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.headers).toMatchObject({ "Content-Type": "application/x-www-form-urlencoded" });

    const form = new URLSearchParams(calls[0]!.init!.body!);
    expect(form.get("store_id")).toBe("testbox");
    expect(form.get("store_passwd")).toBe("qwerty");
    expect(form.get("total_amount")).toBe("1250.50");
    expect(form.get("currency")).toBe("BDT");
    expect(form.get("tran_id")).toBe("ORDER-1001");
    expect(form.get("success_url")).toBe(CREATE_INPUT.callbackURL);
    expect(form.get("ipn_url")).toBe(CREATE_INPUT.callbackURL);
  });

  it("throws when the session status is not SUCCESS", async () => {
    const { fetch } = stubFetch([{ status: "FAILED", failedreason: "Store credential error" }]);
    const provider = new SslcommerzProvider({ fetch });
    await expect(provider.createPayment(CREATE_INPUT, CREDS)).rejects.toThrow(/SSLCommerz session create failed/);
  });

  it("throws on incomplete creds", async () => {
    const { fetch } = stubFetch([]);
    const provider = new SslcommerzProvider({ fetch });
    await expect(
      provider.createPayment(CREATE_INPUT, { mode: "sandbox", storeId: "x" }),
    ).rejects.toThrow(/SSLCommerz credentials incomplete/);
  });
});

describe("SslcommerzProvider.executePayment (validate by val_id)", () => {
  it("GETs the validation API with val_id + store creds and returns the settled amount", async () => {
    const { fetch, calls } = stubFetch([
      { status: "VALID", amount: "1250.50", tran_id: "ORDER-1001", bank_tran_id: "BNK123", val_id: "VAL777" },
    ]);
    const provider = new SslcommerzProvider({ fetch });

    const result = await provider.executePayment({ paymentId: "VAL777" }, CREDS);

    expect(calls[0]!.init?.method).toBe("GET");
    expect(calls[0]!.url).toContain(`${SANDBOX_BASE}/validator/api/validationserverAPI.php?`);
    const u = new URL(calls[0]!.url);
    expect(u.searchParams.get("val_id")).toBe("VAL777");
    expect(u.searchParams.get("store_id")).toBe("testbox");
    expect(u.searchParams.get("store_passwd")).toBe("qwerty");
    expect(u.searchParams.get("format")).toBe("json");

    expect(result.state).toBe("success");
    expect(result.trxId).toBe("BNK123");
    expect(result.amount).toBe("1250.50");
  });

  it("maps a FAILED validation to the failed state", async () => {
    const { fetch } = stubFetch([{ status: "FAILED" }]);
    const provider = new SslcommerzProvider({ fetch });
    const result = await provider.queryPayment({ paymentId: "VAL" }, CREDS);
    expect(result.state).toBe("failed");
  });
});

describe("SslcommerzProvider live URL", () => {
  it("uses the live base when creds.mode === 'live'", async () => {
    const { fetch, calls } = stubFetch([{ status: "VALID", amount: "1" }]);
    const provider = new SslcommerzProvider({ fetch });
    await provider.queryPayment({ paymentId: "VAL" }, { ...CREDS, mode: "live" });
    expect(calls[0]!.url).toContain("https://securepay.sslcommerz.com/validator/api/validationserverAPI.php");
  });
});

describe("sslcommerz code maps", () => {
  it("init SUCCESS→pending, otherwise failed", () => {
    expect(mapSslcommerzInitState({ status: "SUCCESS" })).toBe("pending");
    expect(mapSslcommerzInitState({ status: "FAILED" })).toBe("failed");
  });

  it("txn VALID/VALIDATED→success, CANCELLED→cancelled, FAILED/EXPIRED→failed", () => {
    expect(mapSslcommerzTxnState({ status: "VALID" })).toBe("success");
    expect(mapSslcommerzTxnState({ status: "VALIDATED" })).toBe("success");
    expect(mapSslcommerzTxnState({ status: "CANCELLED" })).toBe("cancelled");
    expect(mapSslcommerzTxnState({ status: "FAILED" })).toBe("failed");
    expect(mapSslcommerzTxnState({ status: "EXPIRED" })).toBe("failed");
    expect(mapSslcommerzTxnState({})).toBe("pending");
  });
});
