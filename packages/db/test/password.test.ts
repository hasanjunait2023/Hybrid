// ============================================================================
// Own-auth password hashing suite (SHIFT 1 / S-AUTH-CORE).
//
// Tests apps/web/lib/auth/password.ts (resolved via the "@/*" vitest alias).
// Pure crypto — no DB. Runs against @node-rs/argon2 when the native binary is
// present, else the node:crypto scrypt fallback; the contract (hash → verify
// true; wrong password → false; tampered hash → false) holds for both.
// ============================================================================
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("own auth — password hashing", () => {
  it("1. hash then verify the same password returns true", async () => {
    const hash = await hashPassword("CorrectHorse42");
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(20);
    expect(await verifyPassword(hash, "CorrectHorse42")).toBe(true);
  });

  it("2. verify with a wrong password returns false", async () => {
    const hash = await hashPassword("CorrectHorse42");
    expect(await verifyPassword(hash, "WrongHorse42")).toBe(false);
  });

  it("3. distinct hashes for the same password (per-call salt)", async () => {
    const a = await hashPassword("same-password-123");
    const b = await hashPassword("same-password-123");
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, "same-password-123")).toBe(true);
    expect(await verifyPassword(b, "same-password-123")).toBe(true);
  });

  it("4. self-describing prefix ($argon2 or scrypt$) routes verify", async () => {
    const hash = await hashPassword("prefix-check-123");
    expect(hash.startsWith("$argon2") || hash.startsWith("scrypt$")).toBe(true);
  });

  it("5. empty/garbage inputs fail closed (no throw on verify)", async () => {
    expect(await verifyPassword("", "x")).toBe(false);
    expect(await verifyPassword("not-a-real-hash", "x")).toBe(false);
    await expect(hashPassword("")).rejects.toThrow();
  });
});
