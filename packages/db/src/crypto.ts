// Credential crypto for @hybrid/db. AES-256-GCM via node:crypto.
//
// Guards the `credentials` jsonb columns on payment_account / courier_account.
// Plaintext credential maps (e.g. {app_key, app_secret} for a gateway) are
// sealed into a self-describing JSON envelope (SealedSecret) before they ever
// touch the DB, and opened only server-side inside a withTenant() transaction.
//
// Pure util: no DB, no Next, no logging of secrets. Callers run inside withTenant.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// JSON envelope stored in jsonb. Versioned so the algorithm can evolve without
// ambiguity. All binary fields are base64. `v:1` + `alg:"A256GCM"` is the only
// shape this module emits or accepts today.
export interface SealedSecret {
  v: 1;
  alg: "A256GCM";
  iv: string; // base64, 12 bytes (GCM standard nonce length)
  ct: string; // base64 ciphertext
  tag: string; // base64, 16-byte GCM auth tag
}

const ALG = "aes-256-gcm";
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM standard nonce
const TAG_BYTES = 16; // GCM auth tag

// Fail-fast key load, mirroring the devSessionSecret() pattern: resolved on
// first use (not at import) and validated to be exactly a base64-encoded
// 32-byte key. A missing or wrong-length key throws immediately rather than
// silently encrypting with a guessable/short key.
let cachedKey: Buffer | null = null;

export function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("APP_ENCRYPTION_KEY is not set (required for credential crypto)");
  }

  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error("APP_ENCRYPTION_KEY must be base64-encoded");
  }

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `APP_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}); ` +
        "generate one with: openssl rand -base64 32",
    );
  }

  cachedKey = key;
  return key;
}

// Seal a plaintext credential map into a SealedSecret envelope. A fresh random
// 12-byte IV is generated per call, so identical inputs never produce identical
// ciphertext.
export function sealCredentials(plain: Record<string, string>): SealedSecret {
  const key = encryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALG, key, iv);

  const plaintext = Buffer.from(JSON.stringify(plain), "utf8");
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    v: 1,
    alg: "A256GCM",
    iv: iv.toString("base64"),
    ct: ct.toString("base64"),
    tag: tag.toString("base64"),
  };
}

// Open a SealedSecret back to its plaintext map. GCM authentication means a
// tampered ciphertext or tag, or the wrong key, causes decipher.final() to
// throw — the result is never silently corrupt.
export function openCredentials(sealed: SealedSecret): Record<string, string> {
  if (!isSealed(sealed)) {
    throw new Error("openCredentials: value is not a SealedSecret envelope");
  }

  const key = encryptionKey();
  const iv = Buffer.from(sealed.iv, "base64");
  const tag = Buffer.from(sealed.tag, "base64");

  if (iv.length !== IV_BYTES) {
    throw new Error("SealedSecret.iv has invalid length");
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error("SealedSecret.tag has invalid length");
  }

  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);

  const ct = Buffer.from(sealed.ct, "base64");
  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);

  return JSON.parse(plaintext.toString("utf8")) as Record<string, string>;
}

// Type guard: is this unknown value (e.g. a jsonb column read) a SealedSecret?
export function isSealed(v: unknown): v is SealedSecret {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    o.v === 1 &&
    o.alg === "A256GCM" &&
    typeof o.iv === "string" &&
    typeof o.ct === "string" &&
    typeof o.tag === "string"
  );
}
