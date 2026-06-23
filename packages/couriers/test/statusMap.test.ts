// ============================================================================
// Status-map suite — asserts EVERY documented Steadfast status mapping plus the
// unknown→in_transit fallback and case-insensitivity.
// ============================================================================
import { describe, it, expect } from "vitest";
import { mapSteadfastStatus, KNOWN_STEADFAST_STATUSES } from "../src/statusMap";

describe("mapSteadfastStatus — documented statuses", () => {
  const cases: Array<[string, string, string]> = [
    // raw, shipment_status, order_fulfillment_status
    ["pending", "created", "confirmed"],
    ["in_review", "created", "confirmed"],
    ["hold", "in_transit", "in_transit"],
    ["delivered_approval_pending", "in_transit", "in_transit"],
    ["delivered", "delivered", "delivered"],
    ["partial_delivered", "delivered", "delivered"],
    ["cancelled", "cancelled", "returned"],
  ];

  it.each(cases)("maps %s → %s / %s", (raw, shipment, fulfillment) => {
    const mapped = mapSteadfastStatus(raw);
    expect(mapped.shipment_status).toBe(shipment);
    expect(mapped.order_fulfillment_status).toBe(fulfillment);
  });

  it("covers every documented status (no gaps)", () => {
    expect(KNOWN_STEADFAST_STATUSES.sort()).toEqual(
      [
        "pending",
        "in_review",
        "hold",
        "delivered_approval_pending",
        "delivered",
        "partial_delivered",
        "cancelled",
      ].sort(),
    );
  });
});

describe("mapSteadfastStatus — fallback & normalization", () => {
  it("unknown statuses fall back to in_transit / in_transit", () => {
    const mapped = mapSteadfastStatus("some_new_steadfast_status");
    expect(mapped.shipment_status).toBe("in_transit");
    expect(mapped.order_fulfillment_status).toBe("in_transit");
  });

  it("empty string falls back to in_transit", () => {
    expect(mapSteadfastStatus("").shipment_status).toBe("in_transit");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(mapSteadfastStatus("  DELIVERED  ").shipment_status).toBe("delivered");
    expect(mapSteadfastStatus("Cancelled").order_fulfillment_status).toBe("returned");
  });
});
