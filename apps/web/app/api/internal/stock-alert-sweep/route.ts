// R7 — Low-stock alert sweep cron (sprint 3).
//
// CRON_SECRET-guarded internal route. Mirrors the other internal
// sweeps: constant-time bearer check, fail-closed when CRON_SECRET
// is unset. Thin auth + wiring layer; the testable orchestration
// lives in lib/marketing/stockAlert.ts.
//
// Recommended cadence: every 30 minutes. The sweep itself dedups via
// a 24h cooldown on last_low_stock_alert_at, so a 30-min cadence
// means we hit a stuck-low variant at most once per 24h.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runStockAlertSweep } from "@/lib/marketing/stockAlert";

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

  const result = await runStockAlertSweep({ now: new Date() });

  return NextResponse.json({
    ok: true,
    scanned: result.scanned,
    notified: result.notified,
    skipped: result.skipped,
    errors: result.errors,
    cooldownHours: result.cooldownHours,
  });
}
