// Unit test for canonical BD phone normalization (apps/web/lib/phone.ts). Pure
// function — no DB — but lives in the shared suite so it runs in CI alongside the
// rest. Guards the marketplace buyer natural-key against duplicate accounts.
import { describe, it, expect } from "vitest";
import { normalizeBdPhone } from "@/lib/phone";

describe("normalizeBdPhone", () => {
  it("passes through a clean local number", () => {
    expect(normalizeBdPhone("01712345678")).toBe("01712345678");
  });

  it("collapses every spelling of the SAME number to one canonical form", () => {
    const canonical = "01712345678";
    expect(normalizeBdPhone("+8801712345678")).toBe(canonical); // +880
    expect(normalizeBdPhone("8801712345678")).toBe(canonical); //  880
    expect(normalizeBdPhone("01712-345678")).toBe(canonical); //  dashes
    expect(normalizeBdPhone(" 01712 345678 ")).toBe(canonical); // spaces
    expect(normalizeBdPhone("1712345678")).toBe(canonical); //     missing leading 0
  });

  it("rejects non-BD / malformed numbers", () => {
    expect(normalizeBdPhone("0121234567")).toBeNull(); // wrong length
    expect(normalizeBdPhone("01212345678")).toBeNull(); // invalid operator prefix 012
    expect(normalizeBdPhone("+15551234567")).toBeNull(); // not a BD number
    expect(normalizeBdPhone("hello")).toBeNull();
    expect(normalizeBdPhone("")).toBeNull();
  });
});
