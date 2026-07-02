// Supabase OAuth callback — exchanges the `code` query param for a session
// cookie, then mints our app's opaque `hybrid_session` (same as the
// email/password path in session.ts) and redirects to the next page.
//
// This route handles ALL OAuth providers (Google, Facebook, GitHub, etc.)
// because they all funnel through Supabase GoTrue's `/auth/v1/callback` →
// our `/auth/callback` with a `code` query param. Provider-agnostic by
// construction.
//
// The callback always lands on admin.{ROOT} (the registered Google origin).
// The session cookie is set on .{ROOT}, so it is readable from any Hybrid
// subdomain. The `next` query param tells us where to send the user afterward.

import { type NextRequest } from "next/server";
import { supabaseAuthClient } from "@/lib/auth/supabaseAuth";
import { mintSessionFromSupabase } from "@/lib/auth/oauth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") ?? "/";
  const error = url.searchParams.get("error_description");

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "hybrid.ecomex.cloud";
  const next = sanitizeNext(rawNext, root);

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

  // Authenticated — bounce to the next page (default "/").
  return Response.redirect(new URL(next, url.origin), 302);
}

/** Allow relative paths OR absolute URLs whose host belongs to the root domain.
 *  Reject everything else to prevent open redirects. */
function sanitizeNext(raw: string, root: string): string {
  // Relative path.
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) {
    return raw;
  }

  // Absolute URL — only permit same root domain (or its subdomains).
  try {
    const u = new URL(raw);
    const host = u.hostname;
    if (host === root || host.endsWith(`.${root}`)) {
      return raw;
    }
  } catch {
    // fall through to default
  }

  return "/";
}
