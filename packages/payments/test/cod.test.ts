// ============================================================================
// COD provider unit suite — instant confirm, no-op execute/query, no network.
// ============================================================================
import { describe, it, expect } from "vitest";
import { CodProvider } from "../src/cod/provider";

const provider = new CodProvider();

const input = {
  amount: "500",
  currency: "BDT" as const,
  merchantInvoiceNumber: "PAY-COD-1",
  payerReference: "01770618575",
  callbackURL: "https://shop/cb",
};

describe("CodProvider", () => {
  it("createPayment confirms instantly with state success", async () => {
    const result = await provider.createPayment(input);
    expect(result.state).toBe("success");
    expect(result.paymentId).toBe("PAY-COD-1");
    expect(result.redirectUrl).toBeUndefined();
  });

  it("executePayment is a no-op returning success", async () => {
    const result = await provider.executePayment({ paymentId: "PAY-COD-1" });
    expect(result.state).toBe("success");
  });

  it("queryPayment is a no-op returning success", async () => {
    const result = await provider.queryPayment({ paymentId: "PAY-COD-1" });
    expect(result.state).toBe("success");
  });

  it("does not offer refund", () => {
    expect((provider as { refund?: unknown }).refund).toBeUndefined();
  });

  it("identifies as the cod provider", () => {
    expect(provider.provider).toBe("cod");
  });
});
