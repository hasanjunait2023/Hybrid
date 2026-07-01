// GET /api/debug/throw
//
// DEBUG-ONLY ROUTE — fires a synthetic error through logError() to verify
// the error-tracking pipeline (error_log DB insert + GlitchTip forward).
// Disabled unless HYBRID_ENABLE_TEST_ROUTES=true.
//
// Query params:
//   ?module=checkout     — module name (defaults to "axis-test")
//   ?message=blah        — message
//   ?level=warn|error    — severity (defaults to "error")
//
// Returns 500 to simulate a real failure.

import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/errors/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (process.env.HYBRID_ENABLE_TEST_ROUTES !== "true") {
    return NextResponse.json(
      { error: "test_routes_disabled", hint: "set HYBRID_ENABLE_TEST_ROUTES=true" },
      { status: 404 }
    );
  }

  const url = new URL(req.url);
  const module = url.searchParams.get("module") ?? "axis-test";
  const message = url.searchParams.get("message") ?? "test error from /api/debug/throw";
  const level = (url.searchParams.get("level") ?? "error") as "error" | "warn" | "info";

  const err = new Error(message);
  Error.captureStackTrace(err, GET);

  await logError({
    module,
    message,
    error: err,
    tenantId: null,
    requestId: req.headers.get("x-request-id") ?? null,
    level,
  });

  return NextResponse.json(
    { ok: true, module, message, level, hint: "check error_log + GlitchTip UI in 5s" },
    { status: 500 }
  );
}
