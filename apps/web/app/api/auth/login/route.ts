// POST /api/auth/login — own-auth password login (SHIFT 1).
//
// Body: { email, password }. Flow (CSRF-checked, rate-limited):
//   1. validate shape
//   2. look up app_user by email via asPlatformAdmin (cross-tenant identity read)
//   3. verifyPassword against the stored Argon2id hash
//   4. createSession on success
//
// SECURITY: the response is a single generic Bengali error for every failure
// (unknown email, no password set, wrong password) so it never reveals which
// field was wrong. We still run verifyPassword against a dummy hash when the
// user is missing to keep timing roughly uniform (no user-enumeration oracle).
import { NextResponse, type NextRequest } from "next/server";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { verifyPassword } from "@/lib/auth/password";
import { verifySupabaseCredentials } from "@/lib/auth/supabaseAuth";
import { createSession } from "@/lib/auth/session";
import { emailSchema, LOGIN_FAILED_BN, RATE_LIMITED_BN, GENERIC_ERROR_BN } from "@/lib/auth/validate";
import { rateLimit, clientIpFrom } from "@/lib/ratelimit";
import { asPlatformAdmin } from "@hybrid/db";

export const runtime = "nodejs";

const LOGIN_MAX_PER_WINDOW = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60; // 15 minutes

// A well-formed scrypt hash of a random value. verifyPassword over this for a
// missing user costs a comparable amount of work to a real check, flattening the
// timing difference an attacker could use to enumerate accounts.
const DUMMY_HASH =
  "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const bad = requireSameOrigin(req);
  if (bad) return bad;

  let body: { email?: unknown; password?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: GENERIC_ERROR_BN }, { status: 400 });
  }

  const emailParsed = emailSchema.safeParse(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  // Shape failures collapse into the same generic message (no field disclosure).
  if (!emailParsed.success || password.length === 0) {
    return NextResponse.json({ ok: false, error: LOGIN_FAILED_BN }, { status: 401 });
  }
  const email = emailParsed.data;

  const ip = clientIpFrom(req.headers);
  const rl = await rateLimit({
    bucket: "login",
    identifier: ip,
    limit: LOGIN_MAX_PER_WINDOW,
    windowSeconds: LOGIN_WINDOW_SECONDS,
    failClosed: true, // auth bucket: reject on a limiter outage, don't wave through.
  });
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: RATE_LIMITED_BN }, { status: 429 });
  }

  try {
    // AUTH_PROVIDER=supabase: GoTrue is the credential authority. Verify there,
    // then map the verified identity to its app_user by email and mint the app
    // session. The same generic error is returned on any failure (no oracle).
    if (process.env.AUTH_PROVIDER === "supabase") {
      const verified = await verifySupabaseCredentials(email, password);
      if (!verified) {
        return NextResponse.json({ ok: false, error: LOGIN_FAILED_BN }, { status: 401 });
      }
      const supaRows = await asPlatformAdmin((tx) =>
        tx<{ id: string }[]>`select id from app_user where email = ${email} limit 1`,
      );
      const supaUserId = supaRows[0]?.id;
      if (!supaUserId) {
        // Valid GoTrue credential but no app_user — identity not provisioned in
        // the app's tenant model. Fail closed with the generic message.
        return NextResponse.json({ ok: false, error: LOGIN_FAILED_BN }, { status: 401 });
      }
      await createSession(supaUserId, { ip, userAgent: req.headers.get("user-agent") });
      return NextResponse.json({ ok: true });
    }

    // --- own-auth (AUTH_PROVIDER=password|dev): local Argon2id/scrypt verify ---
    const rows = await asPlatformAdmin((tx) =>
      tx<{ id: string; password_hash: string | null }[]>`
        select id, password_hash from app_user where email = ${email} limit 1
      `,
    );
    const user = rows[0];

    // Always run a verify (dummy hash when there's no user / no password set) so
    // the timing doesn't betray account existence.
    const hash = user?.password_hash ?? DUMMY_HASH;
    const ok = await verifyPassword(hash, password);

    if (!user || !user.password_hash || !ok) {
      return NextResponse.json({ ok: false, error: LOGIN_FAILED_BN }, { status: 401 });
    }

    await createSession(user.id, { ip, userAgent: req.headers.get("user-agent") });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth/login] failed", err);
    return NextResponse.json({ ok: false, error: GENERIC_ERROR_BN }, { status: 500 });
  }
}
