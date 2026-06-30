// O20 — Auto-cancel unpaid orders cron (sprint 1).
//
// CRON_SECRET-guarded internal route. Configurable via AUTO_CANCEL_HOURS
// (default 48). Mirrors /api/internal/sla-sweep:
//   * Constant-time bearer check, fail-closed if CRON_SECRET is unset.
//   * Thin auth + wiring layer; the testable orchestration lives in
//     lib/orders/autoCancel.ts.
//
// The actual VPS root cron entry is added separately (one-liner in
// docs/INFRA_SUPABASE.md). Recommended cadence: every 30 minutes, same
// cadence as the SLA sweep so neither sweep starves the other of
// `app_runtime_login` connection slots.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runAutoCancelSweep } from "@/lib/orders/autoCancel";

export const dynamic = "force-dynamic";

// Constant-time bearer check. Fail-closed: a missing CRON_SECRET can never
// leave the route open. Constant-time compare avoids leaking the secret via
// response-timing differences. Same shape as /api/internal/sla-sweep and
// /api/internal/billing-sweep.
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

  // Top-level try/catch so a runner exception becomes a 500 with envelope
  // (matching billing/courier sweep behaviour) instead of bubbling up as an
  // unhandled Next.js error that breaks the orchestrator log shape.
  let result: Awaited<ReturnType<typeof runAutoCancelSweep>>;
  try {
    result = await runAutoCancelSweep({ now: new Date() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    scanned: result.scanned,
    cancelled: result.cancelled,
    skippedRace: result.skippedRace,
    errors: result.errors,
    thresholdHours: result.thresholdHours,
  });
}
