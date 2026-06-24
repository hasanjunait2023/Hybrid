// POST /api/auth/signup — own-auth signup (SHIFT 1).
//
// Body: { email, phone, password, storeName, slug, code }.
// Flow (CSRF-checked, rate-limited):
//   1. validate inputs (Bengali errors)
//   2. verifyOtp(phone, "signup", code) — the phone OTP issued by /otp/request
//   3. hashPassword (Argon2id)
//   4. createAppUser({ email, phone, passwordHash }) — refuse if email exists
//      (account-takeover guard, mirrors the dev signup action)
//   5. provisionTenant — atomic tenant + domain + member + subscription
//   6. createSession — mint the opaque DB-backed session cookie
//
// On any post-user failure the orphan app_user is dropped so a retry isn't
// wrongly refused as "already used".
import { NextResponse, type NextRequest } from "next/server";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { verifyOtp } from "@/lib/auth/otp";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import {
  createAppUser,
  provisionTenant,
  deleteOwnerlessUser,
  SlugTakenError,
} from "@/lib/auth/provision";
import {
  emailSchema,
  passwordSchema,
  normalizeBdPhone,
  EMAIL_INVALID_BN,
  PASSWORD_TOO_WEAK_BN,
  PHONE_INVALID_BN,
  OTP_INVALID_BN,
  RATE_LIMITED_BN,
  GENERIC_ERROR_BN,
} from "@/lib/auth/validate";
import { rateLimit, clientIpFrom } from "@/lib/ratelimit";
import { normalizeSlug, validateSlug, suggestSlugs, SLUG_ERROR_BN } from "@/app/(marketing)/signup/slug";

export const runtime = "nodejs";

const STORE_NAME_MAX = 60;
const SIGNUP_MAX_PER_WINDOW = 5;
const SIGNUP_WINDOW_SECONDS = 60 * 60; // 1 hour

type FieldErrors = Partial<
  Record<"storeName" | "slug" | "email" | "phone" | "password" | "code" | "form", string>
>;

function fail(errors: FieldErrors, status: number, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ ok: false, errors, ...extra }, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const bad = requireSameOrigin(req);
  if (bad) return bad;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail({ form: GENERIC_ERROR_BN }, 400);
  }

  const storeName = String(body.storeName ?? "").trim();
  const slug = normalizeSlug(String(body.slug ?? ""));
  const emailParsed = emailSchema.safeParse(body.email);
  const passwordParsed = passwordSchema.safeParse(body.password);
  const phone = normalizeBdPhone(String(body.phone ?? ""));
  const code = String(body.code ?? "").trim();

  // --- Field validation (specific Bengali errors; signup is allowed to guide) ---
  const errors: FieldErrors = {};
  if (storeName.length === 0) errors.storeName = "দোকানের নাম লিখুন।";
  else if (storeName.length > STORE_NAME_MAX) errors.storeName = "দোকানের নাম ৬০ অক্ষরের বেশি হতে পারবে না।";

  const slugError = validateSlug(slug);
  if (slugError) errors.slug = SLUG_ERROR_BN[slugError];
  if (!emailParsed.success) errors.email = EMAIL_INVALID_BN;
  if (!phone) errors.phone = PHONE_INVALID_BN;
  if (!passwordParsed.success) errors.password = PASSWORD_TOO_WEAK_BN;
  if (!/^\d{6}$/.test(code)) errors.code = OTP_INVALID_BN;

  if (Object.keys(errors).length > 0) return fail(errors, 400);

  const email = emailParsed.success ? emailParsed.data : "";
  const password = passwordParsed.success ? passwordParsed.data : "";

  // --- Abuse dampener (per-IP), fails open on a Redis outage ---
  const ip = clientIpFrom(req.headers);
  const rl = await rateLimit({
    bucket: "signup",
    identifier: ip,
    limit: SIGNUP_MAX_PER_WINDOW,
    windowSeconds: SIGNUP_WINDOW_SECONDS,
  });
  if (!rl.allowed) return fail({ form: RATE_LIMITED_BN }, 429);

  // --- (2) OTP verify — the phone must have a valid signup code ---
  const otp = await verifyOtp(phone!, "signup", code);
  if (otp.outcome !== "ok") {
    return fail({ code: OTP_INVALID_BN }, 400);
  }

  // --- (3) hash + (4) create user (takeover guard on existing email) ---
  let userId: string;
  try {
    const passwordHash = await hashPassword(password);
    const created = await createAppUser({
      email,
      phone: phone!,
      fullName: storeName,
      passwordHash,
    });
    if (!created.created) {
      return fail({ email: "এই ইমেইল ইতিমধ্যে ব্যবহৃত — লগ ইন করুন।" }, 409);
    }
    userId = created.userId;
  } catch (err) {
    console.error("[auth/signup] user creation failed", err);
    return fail({ form: GENERIC_ERROR_BN }, 500);
  }

  // --- (5) provision tenant + (6) mint session ---
  try {
    await provisionTenant({ userId, storeName, slug });
    await createSession(userId, {
      ip,
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Drop the orphan user so a legitimate retry isn't refused as "already used".
    await deleteOwnerlessUser(userId).catch((cleanupErr) =>
      console.error("[auth/signup] orphan user cleanup failed", cleanupErr),
    );
    if (err instanceof SlugTakenError) {
      return fail({ slug: err.message }, 409, { suggestions: suggestSlugs(slug) });
    }
    console.error("[auth/signup] provisioning failed", err);
    return fail({ form: GENERIC_ERROR_BN }, 500);
  }
}
