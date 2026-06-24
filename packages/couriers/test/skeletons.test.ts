// ============================================================================
// RedX + Paperfly skeleton suite — these adapters are interface-conformant but
// NOT_CONFIGURED (no public docs). Every operation must throw
// CourierNotConfiguredError, never return a fake success. This test is the
// guard that the skeletons stay explicit stubs, not silent fakes.
// ============================================================================
import { describe, it, expect } from "vitest";
import { RedxProvider } from "../src/redx/provider";
import { PaperflyProvider } from "../src/paperfly/provider";
import { CourierNotConfiguredError } from "../src/types";
import type { CourierCreds, ConsignmentInput } from "../src/types";

const CREDS: CourierCreds = { apiKey: "k", secretKey: "s" };
const INPUT: ConsignmentInput = {
  invoice: "ORDER-1",
  recipient_name: "X",
  recipient_phone: "01700000000",
  recipient_address: "addr",
  cod_amount: 100,
};

describe.each([
  ["redx", () => new RedxProvider()],
  ["paperfly", () => new PaperflyProvider()],
])("%s skeleton (NOT_CONFIGURED)", (name, make) => {
  it("reports its provider literal", () => {
    expect(make().provider).toBe(name);
  });

  it("createConsignment throws CourierNotConfiguredError, never fakes success", async () => {
    const p = make();
    await expect(p.createConsignment(INPUT, CREDS)).rejects.toBeInstanceOf(CourierNotConfiguredError);
    await expect(p.createConsignment(INPUT, CREDS)).rejects.toThrow(`COURIER_NOT_CONFIGURED:${name}`);
  });

  it("getStatus throws CourierNotConfiguredError", async () => {
    await expect(make().getStatus("C1", CREDS)).rejects.toBeInstanceOf(CourierNotConfiguredError);
  });

  it("getBalance throws CourierNotConfiguredError", async () => {
    await expect(make().getBalance(CREDS)).rejects.toBeInstanceOf(CourierNotConfiguredError);
  });

  it("carries the provider name on the error", async () => {
    try {
      await make().createConsignment(INPUT, CREDS);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CourierNotConfiguredError);
      expect((err as CourierNotConfiguredError).providerName).toBe(name);
    }
  });
});
