// Supabase OAuth callback — exchanges the `code` query param for a session
// cookie, then mints our app's opaque `hybrid_session` (same as the
// email/password path in session.ts) and redirects to the next page.
//
// This route handles ALL OAuth providers (Google, Facebook, GitHub, etc.)
// because they all funnel through Supabase GoTrue's `/auth/v1/callback` →
// our `/auth/callback` with a `code` query param. Provider-agnostic by
// construction.

import { type NextRequest } from "next/server";
import { supabaseAuthClient } from "@/lib/auth/supabaseAuth";
import { mintSessionFromSupabase } from "@/lib/auth/oauth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // Open-redirect guard: only allow same-origin local paths. Reject absolute
  // URLs ("https://evil.com") and protocol-relative ("//evil.com", "/\evil")
  // — new URL(next, origin) would otherwise honor an absolute target.
  const rawNext = url.searchParams.get("next") ?? "/admin";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")
      ? rawNext
      : "/admin";
  const error = url.searchParams.get("error_description");

  if (error) {
    // Send the user back to /login with the error message; never echo raw
    // provider errors back to a public-facing redirect target.
    const back = new URL("/login", url.origin);
    back.searchParams.set("oauth_error", "OAuth sign-in failed. Please try again.");
    return Response.redirect(back, 302);
  }

  if (!code) {
    return Response.redirect(new URL("/login", url.origin), 302);
  }

  try {
    const supabase = supabaseAuthClient();
    const { data, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError || !data.session) {
      throw exchangeError ?? new Error("No session in OAuth response");
    }
    await mintSessionFromSupabase(data.session);
  } catch (err) {
    console.error("[auth/callback] OAuth exchange failed:", err);
    const back = new URL("/login", url.origin);
    back.searchParams.set("oauth_error", "Sign-in failed. Please try again.");
    return Response.redirect(back, 302);
  }

  // Authenticated — bounce to the next page (default /admin).
  return Response.redirect(new URL(next, url.origin), 302);
}