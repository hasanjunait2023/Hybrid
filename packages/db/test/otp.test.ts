// ============================================================================
// Own-auth OTP suite (SHIFT 1 / S-AUTH-CORE).
//
// Exercises issueOtp / verifyOtp against the real embedded Postgres
// (06_own_auth.sql) and the in-memory Redis stub (deterministic rate limiting).
// Proves: code is hashed at rest, single-use, 5-min expiry, per-code attempt
// cap, and per-target issuance rate limit (3 / window).
// ============================================================================
import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { asPlatformAdmin } from "../src/index";

process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";

import { issueOtp, verifyOtp } from "../../../apps/web/lib/auth/otp";
import { __resetCache } from "./redis-client-stub";

// Each test uses a fresh target so rows/limits never collide across cases.
function freshTarget(tag: string): string {
  return `+8801${tag}${Math.floor(Math.random() * 1e6).toString().padStart(6, "0")}`;
}

async function clearTarget(target: string): Promise<void> {
  await asPlatformAdmin((tx) => tx`delete from otp_code where target = ${target}`);
}

describe("own auth — OTP", () => {
  // Pin REDIS_URL at execution time (not module load) so the limiter takes its
  // INCR path against the in-memory stub regardless of which other test file's
  // top-level env mutation ran last. Restored after, so resolve.test's
  // DB-fallback path stays intact.
  let prevRedisUrl: string | undefined;
  beforeAll(() => {
    prevRedisUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = "redis://stub";
  });
  afterAll(() => {
    if (prevRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = prevRedisUrl;
  });

  beforeEach(() => {
    __resetCache();
  });

  it("1. issueOtp stores only the SHA-256 hash of the 6-digit code", async () => {
    const target = freshTarget("a");
    const res = await issueOtp(target, "signup");
    expect(res.ok).toBe(true);
    expect(res.code).toMatch(/^\d{6}$/);

    const rows = await asPlatformAdmin((tx) =>
      tx<{ code_hash: string; used: boolean }[]>`
        select code_hash, used from otp_code where target = ${target}
      `,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.code_hash).toBe(createHash("sha256").update(res.code!).digest("hex"));
    expect(rows[0]!.used).toBe(false);
    await clearTarget(target);
  });

  it("2. verifyOtp returns ok for the right code and consumes it (single-use)", async () => {
    const target = freshTarget("b");
    const { code } = await issueOtp(target, "signup");
    expect((await verifyOtp(target, "signup", code!)).outcome).toBe("ok");
    // Second use of the same code → invalid (consumed).
    expect((await verifyOtp(target, "signup", code!)).outcome).toBe("invalid");
    await clearTarget(target);
  });

  it("3. a wrong code returns invalid", async () => {
    const target = freshTarget("c");
    const { code } = await issueOtp(target, "signup");
    const wrong = code === "000000" ? "111111" : "000000";
    expect((await verifyOtp(target, "signup", wrong)).outcome).toBe("invalid");
    await clearTarget(target);
  });

  it("4. an expired code returns expired", async () => {
    const target = freshTarget("d");
    const { code } = await issueOtp(target, "signup");
    await asPlatformAdmin((tx) =>
      tx`update otp_code set expires_at = now() - interval '1 minute' where target = ${target}`,
    );
    expect((await verifyOtp(target, "signup", code!)).outcome).toBe("expired");
    await clearTarget(target);
  });

  it("5. attempt cap locks the code after too many wrong tries", async () => {
    const target = freshTarget("e");
    const { code } = await issueOtp(target, "signup");
    const wrong = code === "000000" ? "111111" : "000000";
    // 5 wrong attempts hit the cap; the 6th is rejected as too_many_attempts.
    for (let i = 0; i < 5; i++) {
      expect((await verifyOtp(target, "signup", wrong)).outcome).toBe("invalid");
    }
    expect((await verifyOtp(target, "signup", code!)).outcome).toBe("too_many_attempts");
    await clearTarget(target);
  });

  it("6. issuance is rate-limited per target (3 per window)", async () => {
    const target = freshTarget("f");
    expect((await issueOtp(target, "signup")).ok).toBe(true);
    expect((await issueOtp(target, "signup")).ok).toBe(true);
    expect((await issueOtp(target, "signup")).ok).toBe(true);
    // 4th within the window is refused.
    expect((await issueOtp(target, "signup")).ok).toBe(false);
    await clearTarget(target);
  });
});
