// One-time passcode (OTP) issue + verify for own auth (SHIFT 1; research brief
// §Topic 2 "OTP Flow"). SMS-only for Phase 2 (email/SMTP deferred to Phase 3).
//
// Storage: otp_code (06_own_auth.sql). The 6-digit code is SHA-256 hashed before
// it ever touches the DB — the raw code lives only in the SMS we send. Verify is
// a constant-time compare of the SHA-256 digests.
//
// Lifecycle: 5-minute expiry; per-code attempt cap (brute-force guard); per-
// target issuance rate-limit (3 / 10 min) via the existing Redis limiter.
// user_id is NULLABLE at signup (the OTP precedes the app_user row), so all
// reads/writes run via asPlatformAdmin (otp_code is admin-gated in RLS).
import { createHash, randomInt, timingSafeEqual } from "crypto";
import { asPlatformAdmin } from "@hybrid/db";
import { rateLimit } from "@/lib/ratelimit";

export type OtpPurpose = "signup" | "login" | "reset";

const OTP_TTL_SECONDS = 5 * 60; // 5 minutes
const OTP_MAX_ATTEMPTS = 5; // per issued code, before it's locked out
const ISSUE_LIMIT = 3; // codes per target …
const ISSUE_WINDOW_SECONDS = 10 * 60; // … per 10 minutes

export interface IssueOtpResult {
  /** false → caller refused by the per-target rate limit (friendly message). */
  ok: boolean;
  /**
   * The raw 6-digit code, returned ONLY so the caller can deliver it via SMS.
   * Never logged, never persisted in plaintext. Undefined when ok=false.
   */
  code?: string;
}

export type VerifyOtpOutcome = "ok" | "invalid" | "expired" | "too_many_attempts";

export interface VerifyOtpResult {
  outcome: VerifyOtpOutcome;
}

// Bengali OTP delivery copy. Code stays Latin digits so it's unambiguous to type
// back; the OTP module owns this so the auth slice doesn't reach into lib/sms.
export function otpMessage(code: string): string {
  return `আপনার Hybrid যাচাই কোড: ${code} — ৫ মিনিটের জন্য বৈধ। কাউকে শেয়ার করবেন না।`;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

// Constant-time compare of two hex digests of equal length.
function digestsEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// Issue a fresh OTP for (target, purpose). Rate-limited per target. The raw code
// is returned to the caller for delivery; only its SHA-256 hash is stored. A new
// issue supersedes prior unused codes implicitly (verify always picks the
// freshest unexpired, unused row).
export async function issueOtp(
  target: string,
  purpose: OtpPurpose,
  userId?: string | null,
): Promise<IssueOtpResult> {
  const rl = await rateLimit({
    bucket: `otp:${purpose}`,
    identifier: target,
    limit: ISSUE_LIMIT,
    windowSeconds: ISSUE_WINDOW_SECONDS,
    failClosed: true, // auth bucket: reject on a limiter outage.
  });
  if (!rl.allowed) return { ok: false };

  // crypto.randomInt is uniform over [100000, 1000000) → always 6 digits.
  const code = String(randomInt(100000, 1000000));
  const codeHash = hashCode(code);

  await asPlatformAdmin(async (tx) => {
    await tx`
      insert into otp_code (user_id, target, code_hash, purpose, expires_at)
      values (
        ${userId ?? null}, ${target}, ${codeHash}, ${purpose},
        now() + ${`${OTP_TTL_SECONDS} seconds`}::interval
      )
    `;
  });

  return { ok: true, code };
}

// Verify a presented code for (target, purpose). Picks the freshest unused,
// unexpired row, increments its attempt counter, and on a match marks it used
// (single-use). Returns a typed outcome so the caller maps to a Bengali message
// without leaking which check failed.
export async function verifyOtp(
  target: string,
  purpose: OtpPurpose,
  code: string,
): Promise<VerifyOtpResult> {
  return asPlatformAdmin(async (tx) => {
    const rows = await tx<
      { id: string; code_hash: string; attempts: number; expired: boolean }[]
    >`
      select id, code_hash, attempts, (expires_at <= now()) as expired
        from otp_code
       where target = ${target}
         and purpose = ${purpose}
         and used = false
       order by created_at desc
       limit 1
    `;
    const row = rows[0];
    if (!row) return { outcome: "invalid" as const };

    if (row.expired) return { outcome: "expired" as const };

    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      return { outcome: "too_many_attempts" as const };
    }

    // Always record the attempt (caps brute force even on a miss).
    await tx`update otp_code set attempts = attempts + 1 where id = ${row.id}`;

    if (!digestsEqual(row.code_hash, hashCode(code))) {
      return { outcome: "invalid" as const };
    }

    // Match → consume the code (single-use).
    await tx`update otp_code set used = true where id = ${row.id}`;
    return { outcome: "ok" as const };
  });
}
