import { headers } from "next/headers";

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
