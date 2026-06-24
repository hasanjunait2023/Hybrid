// Dev-only auth stub. Issues the signed `hybrid_dev_session` cookie used by
// getSession(). GUARDED: 404 in production unless ALLOW_DEV_LOGIN=true AND the
// caller presents the correct DEV_LOGIN_KEY (founder QA on a deployed box).
//
//   GET /dev-login?as=owner-a|owner-b|admin[&key=<DEV_LOGIN_KEY>]
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { DEV_SESSION_COOKIE, DEV_USERS, signDevCookie } from "@/lib/auth/session";

// Constant-time compare of the presented key against DEV_LOGIN_KEY. Returns
// false if either is missing or lengths differ. This is what stops the route
// from minting a credential-less session on a public deployment.
function devKeyOk(presented: string | null): boolean {
  const expected = process.env.DEV_LOGIN_KEY;
  if (!expected || !presented) return false;
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const isProd = process.env.NODE_ENV === "production";

  // Staging override: ALLOW_DEV_LOGIN=true re-enables this on a deployed box
  // for founder check/QA. Default OFF — real production returns 404.
  if (isProd && process.env.ALLOW_DEV_LOGIN !== "true") {
    return new NextResponse("Not found", { status: 404 });
  }

  // On a deployed (production) box the route mints a valid session with no
  // credentials, so require a shared secret key. Mismatch is indistinguishable
  // from "route doesn't exist" (404) — no oracle. Local dev needs no key.
  if (isProd && !devKeyOk(req.nextUrl.searchParams.get("key"))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const as = req.nextUrl.searchParams.get("as");
  const userId = as && as in DEV_USERS ? DEV_USERS[as as keyof typeof DEV_USERS] : null;
  if (!userId) {
    return new NextResponse("Pass ?as=owner-a|owner-b|admin", { status: 400 });
  }

  // signDevCookie uses the fail-fast DEV_SESSION_SECRET (throws if unset).
  const value = signDevCookie(userId);

  // Land on the host root: middleware rewrites admin.* -> /admin (dashboard),
  // app.* -> /platform. Build the absolute redirect from the forwarded Host,
  // but ONLY trust it if it matches our root domain — otherwise an attacker
  // could set Host to redirect victims off-site (open redirect). Fall back to
  // the request's own (trusted) origin.
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  const fwdHost = req.headers.get("host") ?? req.nextUrl.host;
  const hostAllowed = !!root && (fwdHost === root || fwdHost.endsWith(`.${root}`));
  const fwdProto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const base = hostAllowed ? `${fwdProto}://${fwdHost}` : req.nextUrl.origin;
  const res = NextResponse.redirect(new URL("/", base));

  // Cookie on .{ROOT} so it rides admin.* / app.* subdomains (so ?as=admin can
  // reach /platform). Host-only in dev (lvh.me / localhost).
  const cookieDomain =
    root && !root.includes("lvh.me") && !root.includes("localhost") ? `.${root}` : undefined;
  res.cookies.set(DEV_SESSION_COOKIE, value, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    domain: cookieDomain,
  });
  return res;
}
