// POST /api/auth/otp/request — issue + deliver a signup/login OTP.
//
// Body: { target: string (BD phone), purpose: "signup" | "login" }.
// Flow: CSRF Origin check → normalize phone → issueOtp (rate-limited, hashed at
// rest) → deliver via the PLATFORM SmsAdapter (platform sms.net.bd key — solves
// the signup chicken-and-egg: the tenant has no creds yet). Response never
// reveals the code; on rate-limit it returns a friendly Bengali message.
import { NextResponse, type NextRequest } from "next/server";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { issueOtp, otpMessage, type OtpPurpose } from "@/lib/auth/otp";
import { normalizeBdPhone, PHONE_INVALID_BN, RATE_LIMITED_BN, GENERIC_ERROR_BN } from "@/lib/auth/validate";
import { getSmsAdapter } from "@/lib/sms";

export const runtime = "nodejs";

const VALID_PURPOSES: ReadonlySet<string> = new Set(["signup", "login"]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const bad = requireSameOrigin(req);
  if (bad) return bad;

  let body: { target?: unknown; purpose?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: GENERIC_ERROR_BN }, { status: 400 });
  }

  const purposeRaw = String(body.purpose ?? "");
  if (!VALID_PURPOSES.has(purposeRaw)) {
    return NextResponse.json({ ok: false, error: GENERIC_ERROR_BN }, { status: 400 });
  }
  const purpose = purposeRaw as OtpPurpose;

  const phone = normalizeBdPhone(String(body.target ?? ""));
  if (!phone) {
    return NextResponse.json({ ok: false, error: PHONE_INVALID_BN }, { status: 400 });
  }

  try {
    const result = await issueOtp(phone, purpose);
    if (!result.ok || !result.code) {
      return NextResponse.json({ ok: false, error: RATE_LIMITED_BN }, { status: 429 });
    }

    // Deliver via the platform SMS adapter (platform key). Log-only unless
    // SMS_LIVE=1; a delivery failure is surfaced as a generic error (do not leak
    // the code or the gateway detail).
    await getSmsAdapter().send(phone, otpMessage(result.code));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth/otp/request] failed", err);
    return NextResponse.json({ ok: false, error: GENERIC_ERROR_BN }, { status: 500 });
  }
}
