import { NextResponse, type NextRequest } from "next/server";
import { resolveTenantByHost } from "@/lib/tenant/resolve";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN!; // lvh.me (dev) / myhybrid.com (prod)

export const config = {
  // Node.js runtime: resolveTenantByHost uses postgres.js + ioredis (Node-only).
  runtime: "nodejs",
  matcher: ["/((?!api/|_next/|_static/|[\\w-]+\\.\\w+).*)"],
};

// Auth paths must resolve on the admin/app host without the /admin or /platform
// prefix, so layout redirects to /dev-login or /login land on the real route.
function isAuthPath(pathname: string): boolean {
  return (
    pathname === "/dev-login" ||
    pathname.startsWith("/dev-login/") ||
    pathname === "/login" ||
    pathname.startsWith("/login/")
  );
}

// Map a subdomain request onto its route-group prefix. The admin/platform shells
// are served at the SUBDOMAIN ROOT (admin.{ROOT}/orders -> /admin/orders), so a
// bare or root-relative path gets the prefix prepended. But the in-app nav links
// are authored WITH the prefix (href="/admin/orders"), so a click lands on
// admin.{ROOT}/admin/orders — we must NOT prepend a second prefix there (that
// produced /admin/admin/orders -> 404). Accept both forms: if the path is already
// under the prefix, pass it through unchanged; otherwise prepend it.
function withPrefix(pathname: string, prefix: string): string {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
    ? pathname
    : `${prefix}${pathname}`;
}

export default async function middleware(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl;
  const host = (req.headers.get("host") ?? "").split(":")[0] ?? "";

  // /_sites/* is an INTERNAL rewrite target only. A request that arrives with
  // /_sites in the path did not come from our host->tenant rewrite (which adds
  // it server-side), so it's a direct hit attempting tenant enumeration. Block
  // it on every host before any other routing.
  if (url.pathname === "/_sites" || url.pathname.startsWith("/_sites/")) {
    return NextResponse.rewrite(new URL("/store-not-found", req.url));
  }

  const isRoot = host === ROOT || host === `www.${ROOT}`;
  const sub = host.endsWith(`.${ROOT}`) ? host.slice(0, -(ROOT.length + 1)) : null;

  if (isRoot) return NextResponse.next(); // marketing
  if (sub === "app") {
    // Auth routes pass through untouched; everything else is the platform app.
    if (isAuthPath(url.pathname)) return NextResponse.next();
    return NextResponse.rewrite(new URL(withPrefix(url.pathname, "/platform"), req.url));
  }
  if (sub === "admin") {
    // Auth routes pass through untouched; everything else is the admin app.
    if (isAuthPath(url.pathname)) return NextResponse.next();
    return NextResponse.rewrite(new URL(withPrefix(url.pathname, "/admin"), req.url));
  }
  if (sub === "bazar") {
    // The cross-vendor marketplace. Static subdomain — no DB lookup needed.
    return NextResponse.rewrite(new URL(`/market${url.pathname}`, req.url));
  }

  const tenant = await resolveTenantByHost(host);
  if (!tenant) {
    return NextResponse.rewrite(new URL("/store-not-found", req.url));
  }
  return NextResponse.rewrite(new URL(`/_sites/${tenant.slug}${url.pathname}`, req.url));
}
