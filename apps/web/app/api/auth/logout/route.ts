// POST /api/auth/logout — revoke the current session + clear the cookie.
//
// destroySession reads the hybrid_session cookie, sets revoked_at on the row
// (instant revocation — the next getSession lookup filters it out), and expires
// the cookie. CSRF-checked and idempotent: logging out without a session is a
// no-op that still returns ok.
import { NextResponse, type NextRequest } from "next/server";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { destroySession } from "@/lib/auth/session";
import { GENERIC_ERROR_BN } from "@/lib/auth/validate";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const bad = requireSameOrigin(req);
  if (bad) return bad;

  try {
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth/logout] failed", err);
    return NextResponse.json({ ok: false, error: GENERIC_ERROR_BN }, { status: 500 });
  }
}
