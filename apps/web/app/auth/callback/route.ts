// Supabase OAuth callback — exchanges the `code` query param for a session
// cookie, then mints our app's opaque `hybrid_session` (same as the
// email/password path in session.ts) and redirects to the saved `next` URL.
//
// This route lives on admin.{ROOT}/auth/callback (and also resolves on every
// *.hybrid.ecomex.cloud host via middleware). It is the final step of the OAuth
// flow that started on the fixed origin page /oauth/start.
//
// Uses @supabase/ssr createServerClient so the PKCE code verifier stored in
// cookies by the browser client is available for the code exchange. Without
// this the server cannot see the verifier (it lives in browser localStorage
// with the default client) and GoTrue rejects the exchange.

import { NextResponse, type NextRequest } from "next/server";
import { createOAuthCallbackClient } from "@/lib/auth/supabaseServer";
import { createSession } from "@/lib/auth/session";
import { getOAuthNextFromCookie, isAllowedPostLoginUrl } from "@/lib/auth/oauthStartUrl";

function redirectWithClearedCookie(origin: string, path: string): NextResponse {
  const url = new URL(path, origin);
  const res = NextResponse.redirect(url);
  res.cookies.set("hybrid_oauth_next", "", { path: "/", maxAge: 0, sameSite: "lax" });
  return res;
}

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  const fallback = `${origin}/`;
  const nextRaw = getOAuthNextFromCookie(request);
  const next = nextRaw && isAllowedPostLoginUrl(nextRaw) ? nextRaw : fallback;

  if (!code) {
    return redirectWithClearedCookie(
      origin,
      `/login?oauth_error=${encodeURIComponent("No OAuth code received")}`,
    );
  }

  // Prepare a response object early so the SSR Supabase client can write
  // any session cookies back to it during the code exchange.
  const response = NextResponse.redirect(next);

  try {
    const supabase = await createOAuthCallbackClient(request, response);
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

    // Clear the one-time destination cookie and return the redirect.
    response.cookies.set("hybrid_oauth_next", "", { path: "/", maxAge: 0, sameSite: "lax" });
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OAuth callback error";
    return redirectWithClearedCookie(
      origin,
      `/login?oauth_error=${encodeURIComponent(msg)}`,
    );
  }
}
