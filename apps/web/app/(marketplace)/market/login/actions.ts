"use server";

// Buyer OTP login (M4). Phone-first, mirrors the own-auth OTP flow. In dev
// (SMS_LIVE unset) the code is logged, not texted.
import { issueOtp, verifyOtp } from "@/lib/auth/otp";
import { getSmsAdapter } from "@/lib/sms";
import { otpMessage } from "@/lib/auth/otp";
import { upsertBuyerByPhone, createBuyerSession } from "@/lib/marketplace/session";

function normalizePhone(input: string): string {
  return input.replace(/[^\d+]/g, "");
}

export interface AuthResult {
  ok: boolean;
  error?: string;
}

export async function requestBuyerOtp(phoneRaw: string): Promise<AuthResult> {
  const phone = normalizePhone(phoneRaw);
  if (phone.length < 11) return { ok: false, error: "সঠিক মোবাইল নম্বর দিন।" };

  const issued = await issueOtp(phone, "login");
  if (!issued.ok || !issued.code) {
    return { ok: false, error: "অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।" };
  }
  try {
    await getSmsAdapter().send(phone, otpMessage(issued.code));
  } catch {
    return { ok: false, error: "কোড পাঠানো যায়নি। আবার চেষ্টা করুন।" };
  }
  return { ok: true };
}

export async function verifyBuyerOtp(
  phoneRaw: string,
  code: string,
  name?: string,
): Promise<AuthResult> {
  const phone = normalizePhone(phoneRaw);
  const result = await verifyOtp(phone, "login", code.trim());
  if (result.outcome !== "ok") {
    const msg =
      result.outcome === "expired"
        ? "কোডের মেয়াদ শেষ।"
        : result.outcome === "too_many_attempts"
          ? "অনেকবার ভুল হয়েছে। নতুন কোড নিন।"
          : "ভুল কোড।";
    return { ok: false, error: msg };
  }
  const buyerId = await upsertBuyerByPhone(phone, name?.trim() || null);
  await createBuyerSession(buyerId);
  return { ok: true };
}
