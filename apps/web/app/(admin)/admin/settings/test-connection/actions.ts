"use server";

// Test Connection Server Actions (DESIGN §Q4.1 step 5). The RESULT is the point:
// a seller must see proof the creds work before trusting a payment/courier rail.
// Each test runs a REAL, side-effect-free probe against the configured provider
// where one exists; where a provider has no safe read-only endpoint, the test is
// HONEST about what it can and cannot prove (it never fakes a network success).
//
// All probes resolve creds via the existing W0 resolvers (which read + decrypt
// inside withTenant — RLS scoped, secrets opened server-side only, never logged).
import { formatBdtLatin } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getEnabledBkash } from "@/lib/payments/bkash";
import { getNagadCreds } from "@/lib/payments/nagad";
import { getSslcommerzCreds } from "@/lib/payments/sslcommerz";

export interface TestResult {
  ok: boolean;
  message: string;
}

async function activeTenant(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  return getActiveTenantId(session.userId);
}

// ---- bKash: real token grant -----------------------------------------------
export async function testBkash(): Promise<TestResult> {
  const tenantId = await activeTenant();
  if (!tenantId) return { ok: false, message: "লগইন প্রয়োজন।" };
  const enabled = await getEnabledBkash(tenantId);
  if (!enabled) return { ok: false, message: "আগে বিকাশ কনফিগার করে চালু করুন।" };
  try {
    await enabled.provider.grant(enabled.creds);
    return { ok: true, message: "✓ টোকেন পাওয়া গেছে · সংযোগ ঠিক আছে" };
  } catch {
    return { ok: false, message: "ভুল app_key / app_secret / username / password — আবার দেখুন।" };
  }
}

// ---- Nagad: creds-presence + callback reminder (no safe read-only endpoint) --
export async function testNagad(): Promise<TestResult> {
  const tenantId = await activeTenant();
  if (!tenantId) return { ok: false, message: "লগইন প্রয়োজন।" };
  const creds = await getNagadCreds(tenantId);
  if (!creds) {
    return { ok: false, message: "নগদ কনফিগার সম্পূর্ণ নয় — merchant_id ও কী জোড়া দিন এবং চালু করুন।" };
  }
  // Nagad has no non-transactional probe; we confirm the creds are sealed +
  // complete and remind that the callback URL must be whitelisted in the portal.
  return {
    ok: true,
    message: "✓ কী সেভ আছে। মনে রাখুন: callback URL নগদ পোর্টালে বসাতে হবে — নাহলে পেমেন্ট কনফার্ম হবে না।",
  };
}

// ---- SSLCommerz: creds-presence + IPN reminder -----------------------------
export async function testSslcommerz(): Promise<TestResult> {
  const tenantId = await activeTenant();
  if (!tenantId) return { ok: false, message: "লগইন প্রয়োজন।" };
  const creds = await getSslcommerzCreds(tenantId);
  if (!creds) {
    return { ok: false, message: "SSLCommerz কনফিগার সম্পূর্ণ নয় — store_id ও store_password দিন এবং চালু করুন।" };
  }
  return {
    ok: true,
    message: "✓ store_id/পাসওয়ার্ড সেভ আছে। মনে রাখুন: IPN URL প্যানেলে রেজিস্টার করতে হবে।",
  };
}

// ---- Steadfast: real balance call ------------------------------------------
export async function testSteadfast(): Promise<TestResult> {
  const tenantId = await activeTenant();
  if (!tenantId) return { ok: false, message: "লগইন প্রয়োজন।" };
  const { getSteadfastProvider, loadSteadfastCreds, CourierNotConfiguredError } = await import(
    "@/lib/couriers/steadfast"
  );
  try {
    const creds = await loadSteadfastCreds(tenantId, null);
    const balance = await getSteadfastProvider().getBalance(creds);
    return { ok: true, message: `✓ সংযোগ ঠিক আছে · ব্যালেন্স ৳${formatBdtLatin(balance)}` };
  } catch (error) {
    if (error instanceof CourierNotConfiguredError) {
      return { ok: false, message: "আগে Steadfast কনফিগার করে চালু করুন।" };
    }
    return { ok: false, message: "ভুল Api-Key / Secret-Key — আবার দেখুন।" };
  }
}

// ---- Pathao: real OAuth2 grant + balance -----------------------------------
export async function testPathao(): Promise<TestResult> {
  const tenantId = await activeTenant();
  if (!tenantId) return { ok: false, message: "লগইন প্রয়োজন।" };
  const { getPathaoProvider, loadPathaoCreds } = await import("@/lib/couriers/pathao");
  const { CourierNotConfiguredError } = await import("@/lib/couriers/steadfast");
  try {
    const creds = await loadPathaoCreds(tenantId, null);
    // getBalance forces the OAuth2 grant — proves the creds work end-to-end.
    const balance = await getPathaoProvider(tenantId).getBalance(creds);
    return { ok: true, message: `✓ টোকেন পাওয়া গেছে · ব্যালেন্স ৳${formatBdtLatin(balance)}` };
  } catch (error) {
    if (error instanceof CourierNotConfiguredError) {
      return { ok: false, message: "আগে Pathao কনফিগার করে চালু করুন।" };
    }
    return { ok: false, message: "ভুল client_id / client_secret / username / password — আবার দেখুন।" };
  }
}
