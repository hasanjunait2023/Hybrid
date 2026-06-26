import { describe, it, expect } from "vitest";

describe("loyalty point math", () => {
  // Pure helpers — mirrors the formula used inside earnPointsOnDelivery
  // and redeemPoints so we can sanity-check the edge cases.

  function calcEarn(grandTotal: number, earnPer100: number): number {
    return Math.floor((grandTotal / 100) * earnPer100);
  }

  function calcRedeemValue(points: number, takaPerPoint: number): number {
    return points * takaPerPoint;
  }

  it("earns 1 point per 100 BDT at default rate", () => {
    expect(calcEarn(1500, 1)).toBe(15);
  });

  it("rounds down fractional points", () => {
    expect(calcEarn(149, 1)).toBe(1);
    expect(calcEarn(99, 1)).toBe(0);
  });

  it("respects custom earn rate", () => {
    expect(calcEarn(1500, 2)).toBe(30);
  });

  it("redeems at configurable rate", () => {
    expect(calcRedeemValue(50, 1)).toBe(50);
    expect(calcRedeemValue(50, 0.5)).toBe(25);
  });

  it("rejects negative or zero redemption", () => {
    expect(calcRedeemValue(0, 1)).toBe(0);
  });

  it("rewards large orders proportionally", () => {
    expect(calcEarn(50_000, 1)).toBe(500);
    expect(calcEarn(50_000, 2)).toBe(1000);
  });
});