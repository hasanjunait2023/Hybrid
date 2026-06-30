// O16 — Abandoned-cart recovery sweep cron (sprint 3).
//
// CRON_SECRET-guarded internal route. Mirrors /api/internal/auto-cancel-unpaid
// and /api/internal/courier-sync: constant-time bearer check, fail-closed
// when CRON_SECRET is unset. Thin auth + wiring layer; the testable
// orchestration lives in lib/marketing/cartRecovery.ts.
//
// Recommended cadence: every 30 minutes. A cart that's been abandoned for
// 1h+24h+72h is hit at minute 60 / 1440 / 4320 after abandonment. A 30-min
// cadence gives us up to 2 chances per nudge window to fire the SMS.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runCartRecoverySweep } from "@/lib/marketing/cartRecovery";

export const dynamic = "force-dynamic";

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

  const result = await runCartRecoverySweep({ now: new Date() });

  return NextResponse.json({
    ok: true,
    scanned: result.scanned,
    notified: result.notified,
    skipped: result.skipped,
    errors: result.errors,
    thresholdHours: result.thresholdHours,
  });
}
