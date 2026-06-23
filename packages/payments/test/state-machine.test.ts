// ============================================================================
// Payment state-machine unit suite — exercises mapBkashState across every
// documented statusCode/transactionStatus combination (no network).
// ============================================================================
import { describe, it, expect } from "vitest";
import { mapBkashState } from "../src/bkash/codes";

describe("mapBkashState", () => {
  it("0000 + Completed → success", () => {
    expect(mapBkashState({ statusCode: "0000", transactionStatus: "Completed" })).toBe("success");
  });

  it("0000 + Initiated → pending (created, awaiting execute)", () => {
    expect(mapBkashState({ statusCode: "0000", transactionStatus: "Initiated" })).toBe("pending");
  });

  it("0000 with no transactionStatus → pending", () => {
    expect(mapBkashState({ statusCode: "0000" })).toBe("pending");
  });

  it("0000 + Failed → failed", () => {
    expect(mapBkashState({ statusCode: "0000", transactionStatus: "Failed" })).toBe("failed");
  });

  it("0000 + Cancelled → cancelled", () => {
    expect(mapBkashState({ statusCode: "0000", transactionStatus: "Cancelled" })).toBe("cancelled");
  });

  it("non-0000 statusCode → failed regardless of transactionStatus", () => {
    expect(mapBkashState({ statusCode: "2056", transactionStatus: "Completed" })).toBe("failed");
    expect(mapBkashState({ statusCode: "9999" })).toBe("failed");
  });

  it("unknown transactionStatus → failed", () => {
    expect(mapBkashState({ statusCode: "0000", transactionStatus: "Weird" })).toBe("failed");
  });
});
