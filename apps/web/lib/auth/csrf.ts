// CSRF Origin check for auth Route Handlers (research brief §Topic 2 "CSRF").
//
// Next.js Server Actions compare Origin vs Host automatically; Route Handlers do
// NOT, so each state-changing auth POST must call requireSameOrigin() explicitly.
// Combined with the SameSite=Lax session cookie this blocks cross-site form POSTs.
//
// We compare the Origin header's host to the request Host header. A missing
// Origin on a state-changing request is treated as untrusted (fail-closed) — a
// same-origin browser fetch/form always sends Origin on POST.
import { NextResponse, type NextRequest } from "next/server";

// Returns null when the request is same-origin (allow), or a 403 NextResponse
// when it must be rejected. Callers: `const bad = requireSameOrigin(req); if (bad) return bad;`
export function requireSameOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");

  // No Host header is anomalous; refuse rather than guess.
  if (!host) return forbidden();

  // No Origin on a POST → not a normal same-origin browser request. Fail closed.
  if (!origin) return forbidden();

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return forbidden();
  }

  if (originHost !== host) return forbidden();
  return null;
}

function forbidden(): NextResponse {
  // Generic message — never leak which check failed.
  return NextResponse.json(
    { ok: false, error: "অনুরোধটি যাচাই করা যায়নি।" },
    { status: 403 },
  );
}
