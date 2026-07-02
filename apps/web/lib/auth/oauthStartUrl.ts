// OAuth redirect helper. Google Cloud Console rejects wildcard JS origins, so we
// cannot initiate signInWithOAuth from arbitrary tenant subdomains
// (e.g. admin.shop.hybrid.ecomex.cloud). Instead every OAuth click navigates to
// a fixed, registered host (admin.{ROOT}) which then calls Supabase GoTrue.
//
// Flow:
//   1. User clicks Google on any Hybrid host (/login, /market/login, etc.)
//   2. Browser navigates to https://admin.{ROOT}/oauth/start?provider=google&next=...
//   3. That page calls supabase.auth.signInWithOAuth({ redirectTo: admin.{ROOT}/auth/callback?next=... })
//   4. Google redirects to https://supabase.ecomex.cloud/auth/v1/callback
//   5. Supabase redirects to admin.{ROOT}/auth/callback?code=...&next=...
//   6. /auth/callback mints hybrid_session cookie and redirects to `next`

function getRootDomain(): string {
  return process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "hybrid.ecomex.cloud";
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Build the absolute URL for the fixed OAuth start page. */
export function oauthStartUrl(provider: "google" | "facebook", next: string): string {
  const root = getRootDomain();
  if (!isProduction()) {
    if (typeof window !== "undefined") {
      const u = new URL("/oauth/start", window.location.origin);
      u.searchParams.set("provider", provider);
      u.searchParams.set("next", next);
      return u.toString();
    }
  }
  const u = new URL("/oauth/start", `https://admin.${root}`);
  u.searchParams.set("provider", provider);
  u.searchParams.set("next", next);
  return u.toString();
}

/** Build the OAuth callback URL used by supabase.auth.signInWithOAuth. */
export function oauthCallbackUrl(next: string): string {
  const root = getRootDomain();
  if (!isProduction()) {
    if (typeof window !== "undefined") {
      const u = new URL("/auth/callback", window.location.origin);
      u.searchParams.set("next", next);
      return u.toString();
    }
  }
  const u = new URL("/auth/callback", `https://admin.${root}`);
  u.searchParams.set("next", next);
  return u.toString();
}

/** Resolve where to send the user after OAuth succeeds. */
export function defaultPostLoginNext(currentHost: string): string {
  if (currentHost.startsWith("market.")) return "/market/account";
  if (currentHost.startsWith("app.")) return "/";
  return "/";
}
