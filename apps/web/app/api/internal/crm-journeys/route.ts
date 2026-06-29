// CRM lifecycle automation cron (Phase R1.4). CRON_SECRET-guarded internal
// route. Runs every active journey across every live tenant once per invocation:
// evaluates each trigger (review request / win-back / repeat-buyer), sends via
// the gated SMS adapter, and records an idempotent run per recipient so nobody
// is messaged twice for the same event.
//
// Secret handling mirrors billing-sweep / courier-sync: CRON_SECRET from env
// only, fail-closed when unset (never open), never logged.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runAllJourneys } from "@/lib/crm/runJourneys";

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

  const result = await runAllJourneys();

  return NextResponse.json({
    ok: true,
    journeys: result.journeys,
    sent: result.sent,
    failed: result.failed,
  });
}
