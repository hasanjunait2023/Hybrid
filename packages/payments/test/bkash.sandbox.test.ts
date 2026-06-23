// ============================================================================
// bKash REAL public-sandbox smoke — runs grant→create against the live sandbox
// using the real platform fetch. GATED: only runs when BKASH_SANDBOX=1, so CI
// and normal local runs stay offline & deterministic.
//
//   grant  — fully headless, asserts a real id_token is issued.
//   create — fully headless, asserts a real paymentID + bkashURL come back.
//   execute — needs a real popup PIN (12121) + OTP, so it is NOT automatable
//             headless; covered by the stubbed unit suite instead.
//
// Sandbox creds are public test credentials from the integration brief.
// ============================================================================
import { describe, it, expect } from "vitest";
import { BkashProvider } from "../src/bkash/provider";
import { MemoryTokenStore } from "../src/bkash/tokenStore";
import type { FetchLike, ProviderCreds } from "../src/types";

const RUN = process.env.BKASH_SANDBOX === "1";

const CREDS: ProviderCreds = {
  mode: "sandbox",
  username: "sandboxTokenizedUser02",
  password: "sandboxTokenizedUser02@12345",
  appKey: "4f6o0cjiki2rfm34kfdadl1eqq",
  appSecret: "2is7hdktrekvrbljjh44ll3d9l1dtjo4pasmjvs5vl5qr3fug4b",
};

// Adapt the platform fetch to FetchLike (already structurally compatible).
const realFetch: FetchLike = (url, init) =>
  fetch(url, init as RequestInit) as unknown as ReturnType<FetchLike>;

describe.skipIf(!RUN)("bKash public sandbox (network-gated: BKASH_SANDBOX=1)", () => {
  it("grants a real id_token", async () => {
    const provider = new BkashProvider({
      fetch: realFetch,
      tokenStore: new MemoryTokenStore(),
      tokenCacheKey: "bkash:token:sandbox-smoke",
    });
    const token = await provider.grant(CREDS);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("creates a real payment (paymentID + bkashURL)", async () => {
    const provider = new BkashProvider({
      fetch: realFetch,
      tokenStore: new MemoryTokenStore(),
      tokenCacheKey: "bkash:token:sandbox-smoke-create",
    });
    const result = await provider.createPayment(
      {
        amount: "10",
        currency: "BDT",
        merchantInvoiceNumber: `SMOKE-${Date.now()}`,
        payerReference: "01770618575",
        callbackURL: "https://example.com/api/bkash/callback",
      },
      CREDS,
    );
    expect(result.paymentId).not.toBe("");
    expect(result.redirectUrl).toBeTruthy();
    expect(result.state).toBe("pending");
  });
});
