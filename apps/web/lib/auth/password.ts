// Password hashing for own auth (SHIFT 1; research brief §Topic 2).
//
// Primary: Argon2id via @node-rs/argon2 (napi-rs prebuilts — works on Vercel
// Node.js runtime; add serverExternalPackages: ["@node-rs/argon2"] in
// next.config — owned by the env/config slice). OWASP params: memoryCost 19456
// KiB, timeCost 2, parallelism 1.
//
// Fallback: node:crypto scrypt — zero native deps. Used only if @node-rs/argon2
// is unavailable (e.g. native binary failed to load). Both produce a
// self-describing string ($argon2id$... or scrypt$...) so verifyPassword can
// route by prefix and a future migration can re-hash on login.
//
// Argon2 is ~19MB/call; signup/login are rare paths so this is acceptable
// (FastAPI offload is the escape hatch under concurrency pressure).
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "crypto";
import { promisify } from "util";

// promisify loses the options-overload of scrypt; re-type it explicitly so the
// (password, salt, keylen, options) form (we need `maxmem`) type-checks.
const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

// OWASP Argon2id parameters (research brief §Topic 2).
const ARGON2_MEMORY_COST = 19456; // KiB
const ARGON2_TIME_COST = 2;
const ARGON2_PARALLELISM = 1;

// scrypt fallback parameters. N=2^15 is a sane interactive cost; r/p standard.
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_PREFIX = "scrypt$";
// Node's default scrypt maxmem is 32 MiB; our params need 128*N*r ≈ 33.5 MiB, so
// raise the ceiling to 64 MiB (still bounded) or scrypt() throws "memory limit
// exceeded".
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

// argon2 type discriminator (the @node-rs/argon2 Algorithm enum value for
// Argon2id is 2). Imported lazily so a missing native binary degrades to scrypt
// instead of crashing the module at import.
interface NodeRsArgon2 {
  hash(password: string, opts: {
    memoryCost: number;
    timeCost: number;
    parallelism: number;
    algorithm: number;
  }): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

let argon2Mod: NodeRsArgon2 | null | undefined;

// Resolve @node-rs/argon2 once. Returns null if the package/native binary is
// unavailable so callers fall back to scrypt. undefined→not-yet-resolved.
//
// The specifier is held in a variable so tsc does not statically resolve it: the
// native package is a runtime dependency (installed for the build), but the unit
// suite and a not-yet-installed tree degrade to scrypt instead of failing to
// type-check. Runtime import() resolves the real module when present.
const ARGON2_SPECIFIER = "@node-rs/argon2";

async function loadArgon2(): Promise<NodeRsArgon2 | null> {
  if (argon2Mod !== undefined) return argon2Mod;
  try {
    const mod = (await import(/* @vite-ignore */ ARGON2_SPECIFIER)) as unknown as NodeRsArgon2;
    argon2Mod = mod;
  } catch {
    argon2Mod = null;
  }
  return argon2Mod;
}

// Hash a plaintext password. Prefers Argon2id; falls back to scrypt.
export async function hashPassword(plain: string): Promise<string> {
  if (!plain) throw new Error("hashPassword: empty password");

  const argon2 = await loadArgon2();
  if (argon2) {
    // Algorithm 2 === Argon2id in @node-rs/argon2's Algorithm enum.
    return argon2.hash(plain, {
      memoryCost: ARGON2_MEMORY_COST,
      timeCost: ARGON2_TIME_COST,
      parallelism: ARGON2_PARALLELISM,
      algorithm: 2,
    });
  }
  return scryptHash(plain);
}

// Verify a plaintext password against a stored hash. Routes by the hash's
// self-describing prefix, so a DB row hashed with either algorithm verifies
// correctly (supports a transparent argon2 migration of old scrypt rows).
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  if (!hash || !plain) return false;

  if (hash.startsWith(SCRYPT_PREFIX)) {
    return scryptVerify(hash, plain);
  }
  // Anything else is an argon2 PHC string ($argon2id$...). Verify via the
  // native module; if it's unavailable we cannot verify an argon2 hash, so
  // fail closed (return false) rather than throw.
  const argon2 = await loadArgon2();
  if (!argon2) return false;
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

// --- scrypt fallback (format: scrypt$<saltB64>$<keyB64>) ---

async function scryptHash(plain: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derived = await scrypt(plain, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return `${SCRYPT_PREFIX}${salt.toString("base64")}$${derived.toString("base64")}`;
}

async function scryptVerify(hash: string, plain: string): Promise<boolean> {
  const parts = hash.slice(SCRYPT_PREFIX.length).split("$");
  if (parts.length !== 2) return false;
  const [saltB64, keyB64] = parts;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64!, "base64");
    expected = Buffer.from(keyB64!, "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  const derived = await scrypt(plain, salt, expected.length, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
