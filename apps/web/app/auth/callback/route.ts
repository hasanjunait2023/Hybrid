// Supabase OAuth callback — exchanges the `code` query param for a session
// cookie, then mints our app's opaque `hybrid_session` (same as the
// email/password path in session.ts) and redirects to the `next` URL.
//
// This route lives on admin.{ROOT}/auth/callback (and also resolves on every
// *.hybrid.ecomex.cloud host via middleware). It is the final step of the OAuth
// flow that started on the fixed origin page /oauth/start.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSession } from "@/lib/auth/session";
import { getOAuthNextFromCookie, isAllowedPostLoginUrl } from "@/lib/auth/oauthStartUrl";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (required for OAuth callback)`);
  return v;
}

function redirectWithClearedCookie(origin: string, path: string): NextResponse {
  const url = new URL(path, origin);
  const res = NextResponse.redirect(url);
  res.cookies.set("hybrid_oauth_next", "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
  });
  return res;
}

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const code = new URL(request.url).searchParams.get("code");

  const fallback = `${origin}/`;
  const nextRaw = getOAuthNextFromCookie(request);
  const next = nextRaw && isAllowedPostLoginUrl(nextRaw) ? nextRaw : fallback;

  if (!code) {
    return redirectWithClearedCookie(
      origin,
      `/login?oauth_error=${encodeURIComponent("No OAuth code received")}`,
    );
  }

  const supabase = createClient(
    need("SUPABASE_URL"),
    need("SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { error, data } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user?.id) {
    const msg = error?.message ?? "OAuth session exchange failed";
    return redirectWithClearedCookie(
      origin,
      `/login?oauth_error=${encodeURIComponent(msg)}`,
    );
  }

  await createSession(data.user.id, {
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent"),
  });

  return redirectWithClearedCookie(origin, next);
}
