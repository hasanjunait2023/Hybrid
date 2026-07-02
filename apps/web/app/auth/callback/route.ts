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
import { isAllowedPostLoginUrl } from "@/lib/auth/oauthStartUrl";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (required for OAuth callback)`);
  return v;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next");

  const fallback = `${origin}/`;
  const next = nextRaw && isAllowedPostLoginUrl(nextRaw) ? nextRaw : fallback;

  if (!code) {
    return NextResponse.redirect(
      new URL(`/login?oauth_error=${encodeURIComponent("No OAuth code received")}`, origin),
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
    return NextResponse.redirect(
      new URL(`/login?oauth_error=${encodeURIComponent(msg)}`, origin),
    );
  }

  await createSession(data.user.id, {
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.redirect(next);
}
