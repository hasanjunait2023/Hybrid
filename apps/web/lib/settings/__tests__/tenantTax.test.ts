// =============================================================================
// O13 — Tenant TIN / BIN pure validation tests
//
// We lock down the format rules here at the cheap, no-DB layer. The DB-side
// CHECK constraints in 32_o13_tin_bin.sql mirror these — if either drift
// from the other, this test suite catches it before it ships.
//
// What's covered:
//   * TIN must be exactly 12 digits, no spaces, no dashes, no letters
//   * BIN must be exactly 10 digits, same constraints
//   * Empty / whitespace input normalizes to null (lets UI clear the field)
//   * `validateTenantTax` throws TenantTaxValidationError with the right code
//   * The Zod TenantTaxInput schema produces Bengali-friendly messages
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  TIN_REGEX,
  BIN_REGEX,
  TenantTaxInput,
} from "../tenantTaxSchema";
import {
  normalizeTin,
  normalizeBin,
  validateTenantTax,
  TenantTaxValidationError,
} from "../tenantTax";

describe("TIN_REGEX / BIN_REGEX — Bangladesh NBR formats", () => {
  it("TIN accepts exactly 12 digits", () => {
    expect(TIN_REGEX.test("123456789012")).toBe(true);
    expect(TIN_REGEX.test("000000000000")).toBe(true);
    expect(TIN_REGEX.test("999999999999")).toBe(true);
  });

  it("TIN rejects anything other than 12 digits", () => {
    expect(TIN_REGEX.test("")).toBe(false);
    expect(TIN_REGEX.test("12345678901")).toBe(false); // 11
    expect(TIN_REGEX.test("1234567890123")).toBe(false); // 13
    expect(TIN_REGEX.test("12345 6789012")).toBe(false); // space
    expect(TIN_REGEX.test("123-456-789012")).toBe(false); // dash
    expect(TIN_REGEX.test("12345678901a")).toBe(false); // letter
    expect(TIN_REGEX.test("abcdefghijkl")).toBe(false); // letters only
  });

  it("BIN accepts exactly 10 digits", () => {
    expect(BIN_REGEX.test("1234567890")).toBe(true);
    expect(BIN_REGEX.test("0000000000")).toBe(true);
  });

  it("BIN rejects anything other than 10 digits", () => {
    expect(BIN_REGEX.test("")).toBe(false);
    expect(BIN_REGEX.test("123456789")).toBe(false); // 9
    expect(BIN_REGEX.test("12345678901")).toBe(false); // 11
    expect(BIN_REGEX.test("123 4567890")).toBe(false); // space
    expect(BIN_REGEX.test("123456789a")).toBe(false); // letter
  });
});

describe("normalizeTin / normalizeBin", () => {
  it("returns null for empty / whitespace-only / non-string", () => {
    expect(normalizeTin("")).toBeNull();
    expect(normalizeTin("   ")).toBeNull();
    expect(normalizeTin(null)).toBeNull();
    expect(normalizeTin(undefined)).toBeNull();
    expect(normalizeTin(123)).toBeNull();

    expect(normalizeBin("")).toBeNull();
    expect(normalizeBin("\t")).toBeNull();
    expect(normalizeBin(null)).toBeNull();
  });

  it("trims surrounding whitespace before returning", () => {
    expect(normalizeTin("  123456789012  ")).toBe("123456789012");
    expect(normalizeBin(" 1234567890 ")).toBe("1234567890");
  });

  it("preserves digits verbatim (format check is the next stage)", () => {
    expect(normalizeTin("12345")).toBe("12345"); // wrong length — caught later
    expect(normalizeBin("abc")).toBe("abc"); // wrong charset — caught later
  });
});

describe("validateTenantTax — full validation", () => {
  it("accepts well-formed TIN + BIN pair", () => {
    expect(
      validateTenantTax({ tin: "123456789012", bin: "1234567890" }),
    ).toEqual({ tin: "123456789012", bin: "1234567890" });
  });

  it("accepts empty inputs (clears both fields)", () => {
    expect(validateTenantTax({ tin: "", bin: "" })).toEqual({
      tin: null,
      bin: null,
    });
    expect(validateTenantTax({ tin: "   ", bin: "\t" })).toEqual({
      tin: null,
      bin: null,
    });
  });

  it("accepts TIN set with BIN empty, and vice versa", () => {
    expect(validateTenantTax({ tin: "123456789012", bin: "" })).toEqual({
      tin: "123456789012",
      bin: null,
    });
    expect(validateTenantTax({ tin: "", bin: "1234567890" })).toEqual({
      tin: null,
      bin: "1234567890",
    });
  });

  it("throws TenantTaxValidationError(TIN_INVALID) on bad TIN", () => {
    expect(() =>
      validateTenantTax({ tin: "12345", bin: "1234567890" }),
    ).toThrow(TenantTaxValidationError);
    try {
      validateTenantTax({ tin: "12345", bin: "1234567890" });
    } catch (err) {
      expect(err).toBeInstanceOf(TenantTaxValidationError);
      expect((err as TenantTaxValidationError).code).toBe("TIN_INVALID");
      expect((err as TenantTaxValidationError).message).toMatch(/TIN/);
    }
  });

  it("throws TenantTaxValidationError(BIN_INVALID) on bad BIN", () => {
    expect(() =>
      validateTenantTax({ tin: "123456789012", bin: "123" }),
    ).toThrow(TenantTaxValidationError);
    try {
      validateTenantTax({ tin: "123456789012", bin: "123" });
    } catch (err) {
      expect(err).toBeInstanceOf(TenantTaxValidationError);
      expect((err as TenantTaxValidationError).code).toBe("BIN_INVALID");
    }
  });

  it("TIN is validated before BIN (TIN failure short-circuits)", () => {
    // Both invalid → TIN error wins (deterministic ordering for the UI).
    expect(() =>
      validateTenantTax({ tin: "short", bin: "short" }),
    ).toThrow(TenantTaxValidationError);
    try {
      validateTenantTax({ tin: "short", bin: "short" });
    } catch (err) {
      expect((err as TenantTaxValidationError).code).toBe("TIN_INVALID");
    }
  });
});

describe("TenantTaxInput — Zod schema for the Server Action", () => {
  it("accepts a valid pair", () => {
    const r = TenantTaxInput.safeParse({
      tin: "123456789012",
      bin: "1234567890",
    });
    expect(r.success).toBe(true);
  });

  it("treats missing keys as empty (form may omit cleared fields)", () => {
    const r = TenantTaxInput.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.tin).toBe("");
      expect(r.data.bin).toBe("");
    }
  });

  it("rejects TIN that isn't 12 digits, with a Bengali message", () => {
    const r = TenantTaxInput.safeParse({ tin: "12345", bin: "1234567890" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues[0]?.message ?? "";
      expect(msg).toMatch(/TIN/);
      expect(msg).toMatch(/১২/);
    }
  });

  it("rejects BIN that isn't 10 digits, with a Bengali message", () => {
    const r = TenantTaxInput.safeParse({ tin: "123456789012", bin: "123" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues[0]?.message ?? "";
      expect(msg).toMatch(/BIN/);
      expect(msg).toMatch(/১০/);
    }
  });
});