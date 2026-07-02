// OAuth redirect helper. Google Cloud Console rejects wildcard JS origins, so we
// cannot initiate signInWithOAuth from arbitrary tenant subdomains
// (e.g. admin.shop.hybrid.ecomex.cloud). Instead we hard-navigate every OAuth
// start to a fixed, registered origin: https://admin.{ROOT}/oauth/start. That
// page calls supabase.auth.signInWithOAuth from the registered origin, so
// Google only sees exact origins.
//
// Flow:
//   1. User on admin.shop.{ROOT}/login clicks "Continue with Google"
//   2. We navigate to admin.{ROOT}/oauth/start?provider=google&next=URL
//   3. Start page calls supabase.auth.signInWithOAuth({
//        provider: "google",
//        options: { redirectTo: "https://admin.{ROOT}/auth/callback?next=URL" }
//      })
//   4. Google redirects to supabase.{ROOT}/auth/v1/callback (registered in Console)
//   5. Supabase redirects to admin.{ROOT}/auth/callback?code=...&next=URL
//   6. /auth/callback mints hybrid_session cookie (domain .{ROOT}) and redirects to URL

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "hybrid.ecomex.cloud";
const DEFAULT_OAUTH_HOST = "admin";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Build the absolute URL for the fixed OAuth start page. */
export function oauthStartUrl(provider: "google" | "facebook", next: string): string {
  if (!isProduction()) {
    if (typeof window !== "undefined") {
      const u = new URL("/oauth/start", window.location.origin);
      u.searchParams.set("provider", provider);
      u.searchParams.set("next", next);
      return u.toString();
    }
  }
  const u = new URL("/oauth/start", `https://${DEFAULT_OAUTH_HOST}.${ROOT}`);
  u.searchParams.set("provider", provider);
  u.searchParams.set("next", next);
  return u.toString();
}

/** Build the OAuth callback URL used by supabase.auth.signInWithOAuth. */
export function oauthCallbackUrl(next: string): string {
  if (!isProduction()) {
    if (typeof window !== "undefined") {
      const u = new URL("/auth/callback", window.location.origin);
      u.searchParams.set("next", next);
      return u.toString();
    }
  }
  const u = new URL("/auth/callback", `https://${DEFAULT_OAUTH_HOST}.${ROOT}`);
  u.searchParams.set("next", next);
  return u.toString();
}

/** Resolve where to send the user after OAuth succeeds. Returns an absolute URL
 *  so the fixed admin.{ROOT} callback host can redirect back to the original
 *  tenant/app/market host. */
export function defaultPostLoginNext(currentHost: string): string {
  const protocol = isProduction() ? "https" : "http";
  if (currentHost.startsWith("market.")) {
    return `${protocol}://${currentHost}/market/account`;
  }
  return `${protocol}://${currentHost}/`;
}

/** Validate that a post-login URL points to an allowed Hybrid host so we don't
 *  create an open redirect via the ?next= query param. */
export function isAllowedPostLoginUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  // Only HTTPS in production; http is fine for local dev.
  if (isProduction() && parsed.protocol !== "https:") return false;

  const host = parsed.host;
  // Exact apex / fixed hosts, plus any *.hybrid.ecomex.cloud subdomain.
  const allowedExact = [
    ROOT,
    `admin.${ROOT}`,
    `app.${ROOT}`,
    `market.${ROOT}`,
    `www.${ROOT}`,
  ];
  if (allowedExact.includes(host)) return true;
  if (host.endsWith(`.${ROOT}`)) return true;
  // Local dev hosts
  if (!isProduction() && (host.includes("lvh.me") || host.includes("localhost"))) {
    return true;
  }
  return false;
}
