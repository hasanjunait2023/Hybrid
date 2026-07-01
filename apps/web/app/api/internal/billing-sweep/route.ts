// Billing sweep cron (blueprint S-BILLING). CRON_SECRET-guarded internal route.
//
// Drives the billing state machine across all tenants once per run: trialing/
// active subscriptions whose period has lapsed move to past_due; past_due
// tenants whose 3-day grace is exhausted have their tenant.status flipped to
// 'suspended' (storefront then 404s via resolve.ts) and their host->tenant cache
// busted. The testable orchestration lives in lib/billing/sweep.ts; this file is
// the thin auth + wiring layer (injects the real domain cache buster).
//
// Secret handling mirrors courier-sync: CRON_SECRET from env only, fail-closed
// when unset (never open), never logged.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runBillingSweep } from "@/lib/billing/sweep";
import { bustTenantDomainCache } from "@/lib/platform/cache";

export const dynamic = "force-dynamic";

// Constant-time bearer check. Fail-closed: a missing CRON_SECRET can never leave
// the route open. Constant-time compare avoids leaking the secret via timing.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await runBillingSweep(new Date(), bustTenantDomainCache);

  return NextResponse.json({
    ok: true,
    checked: result.checked,
    suspended: result.suspended,
    pastDue: result.pastDue,
    errors: result.errors,
  });
}
