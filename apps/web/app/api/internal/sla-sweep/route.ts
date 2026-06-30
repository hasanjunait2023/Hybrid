// SLA sweep cron (BD Digital Commerce Guidelines 2021 — research brief §B.3).
//
// CRON_SECRET-guarded internal route. Pings merchants about overdue order
// SLAs once per (order, alert_kind, channel). The testable orchestration
// lives in lib/sla/sweep.ts; this file is the thin auth + wiring layer.
//
// Designed to be called from the VPS root cron every 30 minutes. Cheap
// enough at scale — the active-orders partial index keeps the scan well
// under 1s even at 100k orders.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runSlaSweep } from "@/lib/sla/sweep";

export const dynamic = "force-dynamic";

// Constant-time bearer check. Fail-closed: a missing CRON_SECRET can never
// leave the route open. Constant-time compare avoids leaking the secret via
// response-timing differences. Mirrors /api/internal/courier-sync + billing-
// sweep.
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

  const result = await runSlaSweep({ now: new Date() });

  return NextResponse.json({
    ok: true,
    scanned: result.scanned,
    alertsSent: result.alertsSent,
    byKind: result.byKind,
    skippedNoPhone: result.skippedNoPhone,
    errors: result.errors,
  });
}