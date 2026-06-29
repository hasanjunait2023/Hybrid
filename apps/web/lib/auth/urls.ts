import { headers } from "next/headers";

// Where an auth-gated layout sends an unauthenticated visitor. The seeded
// dev-login (?as=<identity>) is used ONLY in local dev with the dev provider;
// production AND the supabase/password providers always use the real /login.
// This guarantees prod never routes to the prod-disabled dev-login (a dead 307)
// and never leaks a seeded identity in a redirect URL — even if AUTH_PROVIDER is
// accidentally unset in production (NODE_ENV gates it shut regardless).
export function loginPath(devAs: string): string {
  const provider = process.env.AUTH_PROVIDER;
  const useDevLogin =
    process.env.NODE_ENV !== "production" &&
    provider !== "supabase" &&
    provider !== "password";
  return useDevLogin ? `/dev-login?as=${devAs}` : "/login";
}

// Absolute admin-host login URL. Login is HOST-SCOPED: LoginForm hard-navigates
// to "/" on success, and middleware.ts maps the `admin` subdomain root onto the
// /admin dashboard. So a login link shown on the marketing host (hybrid.{ROOT})
// MUST point at admin.{ROOT}/login — a same-host /login would land the user back
// on the marketing home after auth, not their dashboard. Port is preserved from
// the incoming Host header so the link works on lvh.me:3000 locally and bare in
// prod. Mirrors adminUrl() in (marketing)/signup/actions.ts.
export async function adminLoginUrl(): Promise<string> {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "myhybrid.com";
  const isProd = process.env.NODE_ENV === "production";
  const scheme = isProd ? "https" : "http";
  // The authority host is the trusted env ROOT, never the Host header. The only
  // thing dev needs from the request is the port (lvh.me:3000). NEVER derive a
  // port in prod (bare 443), and in dev accept ONLY a numeric suffix — a crafted
  // Host like "admin.x:443@evil.com" must not inject userinfo/@ and turn this
  // login link into an open redirect.
  let port = "";
  if (!isProd) {
    const m = (await headers()).get("host")?.match(/:(\d{1,5})$/);
    port = m ? `:${m[1]}` : "";
  }
  return `${scheme}://admin.${root}${port}/login`;
}

// Absolute platform-host home URL (app.{ROOT}/ -> /platform dashboard). Used to
// send a platform admin who landed on the ADMIN host (e.g. via the marketing
// "Log in" link) over to their console: the admin layout has no tenant for them
// and a relative redirect("/platform") on the admin host rewrites to
// /admin/platform -> 404. Same trusted-ROOT + numeric-port-only hardening as
// adminLoginUrl (no Host-header authority, no open-redirect).
export async function platformHomeUrl(): Promise<string> {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "myhybrid.com";
  const isProd = process.env.NODE_ENV === "production";
  const scheme = isProd ? "https" : "http";
  let port = "";
  if (!isProd) {
    const m = (await headers()).get("host")?.match(/:(\d{1,5})$/);
    port = m ? `:${m[1]}` : "";
  }
  return `${scheme}://app.${root}${port}/`;
}
