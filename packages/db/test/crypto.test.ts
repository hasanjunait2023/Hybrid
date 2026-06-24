// ============================================================================
// Credential crypto unit suite — AES-256-GCM seal/open round-trip + tamper +
// wrong-key. Pure node:crypto, no Postgres needed (but the embedded-pg
// globalSetup still runs for the package; that is harmless here).
//
// encryptionKey() resolves APP_ENCRYPTION_KEY lazily and caches it, so each
// "wrong key" case is exercised by re-importing the module with a different
// env via vi.resetModules() + dynamic import.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { sealCredentials, openCredentials, isSealed } from "../src/crypto";

const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");

beforeEach(() => {
  process.env.APP_ENCRYPTION_KEY = KEY_A;
  // Re-import path resets module-level cachedKey between cases that swap keys.
  vi.resetModules();
});

describe("credential crypto (AES-256-GCM)", () => {
  it("round-trips a credential map", () => {
    const plain = { app_key: "4f6o0cjiki2rfm34kfdadl1eqq", app_secret: "2is7hdktrekvrbljjh44ll3d9l1dtjo4" };
    const sealed = sealCredentials(plain);

    expect(isSealed(sealed)).toBe(true);
    expect(sealed.v).toBe(1);
    expect(sealed.alg).toBe("A256GCM");
    // Secret must not appear in the envelope in plaintext.
    expect(JSON.stringify(sealed)).not.toContain("4f6o0cjiki2rfm34kfdadl1eqq");

    const opened = openCredentials(sealed);
    expect(opened).toEqual(plain);
  });

  it("produces a fresh random IV per seal (no ciphertext reuse)", () => {
    const plain = { token: "same-input" };
    const a = sealCredentials(plain);
    const b = sealCredentials(plain);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
    // Both still decrypt to the same plaintext.
    expect(openCredentials(a)).toEqual(plain);
    expect(openCredentials(b)).toEqual(plain);
  });

  it("isSealed rejects non-envelope values", () => {
    expect(isSealed(null)).toBe(false);
    expect(isSealed("string")).toBe(false);
    expect(isSealed({})).toBe(false);
    expect(isSealed({ v: 2, alg: "A256GCM", iv: "x", ct: "y", tag: "z" })).toBe(false);
    expect(isSealed({ v: 1, alg: "A256GCM", iv: "x", ct: "y" })).toBe(false);
  });

  it("throws on a tampered ciphertext (GCM auth)", () => {
    const sealed = sealCredentials({ app_secret: "topsecret" });
    const ctBuf = Buffer.from(sealed.ct, "base64");
    ctBuf[0] = ctBuf[0]! ^ 0xff; // flip a byte
    const tampered = { ...sealed, ct: ctBuf.toString("base64") };
    expect(() => openCredentials(tampered)).toThrow();
  });

  it("throws on a tampered auth tag (GCM auth)", () => {
    const sealed = sealCredentials({ app_secret: "topsecret" });
    const tagBuf = Buffer.from(sealed.tag, "base64");
    tagBuf[0] = tagBuf[0]! ^ 0xff; // flip a byte
    const tampered = { ...sealed, tag: tagBuf.toString("base64") };
    expect(() => openCredentials(tampered)).toThrow();
  });

  it("throws when opened with the wrong key", async () => {
    // Seal under KEY_A.
    const sealed = sealCredentials({ app_secret: "topsecret" });

    // Swap the key and re-import so encryptionKey() re-reads APP_ENCRYPTION_KEY.
    process.env.APP_ENCRYPTION_KEY = KEY_B;
    vi.resetModules();
    const { openCredentials: openWithB } = await import("../src/crypto");

    expect(() => openWithB(sealed)).toThrow();
  });

  it("encryptionKey fails fast when APP_ENCRYPTION_KEY is missing", async () => {
    delete process.env.APP_ENCRYPTION_KEY;
    vi.resetModules();
    const { sealCredentials: sealNoKey } = await import("../src/crypto");
    expect(() => sealNoKey({ a: "b" })).toThrow(/APP_ENCRYPTION_KEY is not set/);
  });

  it("encryptionKey rejects a wrong-length key", async () => {
    process.env.APP_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    vi.resetModules();
    const { sealCredentials: sealBadKey } = await import("../src/crypto");
    expect(() => sealBadKey({ a: "b" })).toThrow(/32 bytes/);
  });

  // Nagad seals a ~1.7KB PEM private key + a PEM public key in one credential
  // map. AES-256-GCM handles arbitrary JSON size; this guards that a large PEM
  // payload round-trips and never appears in the envelope in plaintext.
  it("round-trips a large PEM payload (Nagad merchant keypair, ~1.7KB)", () => {
    const merchantPrivateKey =
      "-----BEGIN PRIVATE KEY-----\n" +
      // 24 base64 lines ≈ 1.5KB of key body — representative of a 2048-bit PKCS8 PEM.
      Array.from({ length: 24 }, (_, i) =>
        Buffer.from(`nagad-merchant-private-key-line-${i}-`.repeat(2)).toString("base64"),
      ).join("\n") +
      "\n-----END PRIVATE KEY-----\n";
    const nagadPublicKey =
      "-----BEGIN PUBLIC KEY-----\n" +
      Buffer.from("nagad-public-key-material").toString("base64") +
      "\n-----END PUBLIC KEY-----\n";

    const plain = {
      merchant_id: "683002007104225",
      merchant_private_key: merchantPrivateKey,
      nagad_public_key: nagadPublicKey,
    };
    expect(merchantPrivateKey.length).toBeGreaterThan(1500);

    const sealed = sealCredentials(plain);
    expect(isSealed(sealed)).toBe(true);
    // The PEM body must not be readable in the sealed envelope.
    expect(JSON.stringify(sealed)).not.toContain("BEGIN PRIVATE KEY");
    expect(openCredentials(sealed)).toEqual(plain);
  });
});
