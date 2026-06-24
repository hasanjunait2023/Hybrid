// Shared input validators for the auth routes. Bengali-first messages; the auth
// surfaces must never leak which field failed on login (use a single generic
// message there), but signup/OTP-request can be specific to guide the seller.
import { z } from "zod";

// Bangladesh mobile in E.164-ish form. Accepts 01XXXXXXXXX (local) or
// +8801XXXXXXXXX and normalizes to the +880 form. OTP targets are phones in P2.
const BD_LOCAL_RE = /^01[3-9]\d{8}$/;
const BD_E164_RE = /^\+8801[3-9]\d{8}$/;

// Normalize a BD phone to +8801XXXXXXXXX, or return null if not a valid BD number.
export function normalizeBdPhone(input: string): string | null {
  const trimmed = input.replace(/[\s-]/g, "");
  if (BD_E164_RE.test(trimmed)) return trimmed;
  if (BD_LOCAL_RE.test(trimmed)) return `+88${trimmed}`;
  return null;
}

export const emailSchema = z.string().trim().toLowerCase().email();

// OWASP-aligned floor: 8 chars. No max enforced beyond a sane cap (argon2 hashes
// any length; a cap avoids a trivial DoS via megabyte passwords).
export const passwordSchema = z.string().min(8).max(200);

export const PASSWORD_TOO_WEAK_BN = "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।";
export const PHONE_INVALID_BN = "সঠিক মোবাইল নম্বর লিখুন (যেমন 01XXXXXXXXX)।";
export const EMAIL_INVALID_BN = "সঠিক ইমেইল ঠিকানা লিখুন।";
// Deliberately generic — login must not reveal whether email or password was wrong.
export const LOGIN_FAILED_BN = "ইমেইল বা পাসওয়ার্ড সঠিক নয়।";
export const OTP_INVALID_BN = "কোডটি সঠিক নয় বা মেয়াদ শেষ হয়েছে।";
export const RATE_LIMITED_BN = "অনেকবার চেষ্টা করা হয়েছে — কিছুক্ষণ পর আবার চেষ্টা করুন।";
export const GENERIC_ERROR_BN = "দুঃখিত, কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।";
