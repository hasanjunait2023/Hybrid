import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import type { AnalyticsItem } from "../events";
import {
  hashEmailForMeta,
  hashPhoneForMeta,
  buildFunnelEventId,
  sumFunnelValue,
  toFunnelItem,
} from "../funnel";

const sha256Hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

describe("funnel helpers", () => {
  it("buildFunnelEventId returns a UUID", () => {
    const id = buildFunnelEventId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("sumFunnelValue totals price * quantity", () => {
    const items: AnalyticsItem[] = [
      { id: "p1", name: "A", price: 100, quantity: 2 },
      { id: "p2", name: "B", price: 50, quantity: 1 },
    ];
    expect(sumFunnelValue(items)).toBe(250);
  });

  it("toFunnelItem builds AnalyticsItem", () => {
    expect(toFunnelItem({ id: "p1", name: "Shirt", price: 500, quantity: 2 })).toEqual({
      id: "p1",
      name: "Shirt",
      price: 500,
      quantity: 2,
    });
  });

  it("hashEmailForMeta lowercases and hashes", () => {
    expect(hashEmailForMeta("  Test@Example.COM  ")).toBe(sha256Hex("test@example.com"));
  });

  it("hashPhoneForMeta normalizes BD number and hashes", () => {
    expect(hashPhoneForMeta("  01712345678  ")).toBe(sha256Hex("8801712345678"));
  });

  it("hashPhoneForMeta keeps existing 880 prefix", () => {
    expect(hashPhoneForMeta("8801712345678")).toBe(sha256Hex("8801712345678"));
  });

  it("hash helpers return null for empty input", () => {
    expect(hashEmailForMeta(null)).toBeNull();
    expect(hashEmailForMeta("")).toBeNull();
    expect(hashPhoneForMeta(undefined)).toBeNull();
  });
});

// Browser-only module; dynamic import avoids pulling it (and "document")
// into the non-DOM test runner at top level.
describe("browser helpers (smoke)", () => {
  it("readUtmFromUrl returns empty object on server", async () => {
    const { readUtmFromUrl } = await import("../browser");
    expect(readUtmFromUrl()).toEqual({});
  });
});
