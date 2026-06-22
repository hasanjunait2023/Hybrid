import { NextResponse, type NextRequest } from "next/server";
import { resolveTenantByHost } from "@/lib/tenant/resolve";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN!; // lvh.me (dev) / myhybrid.com (prod)

export const config = {
  // Node.js runtime: resolveTenantByHost uses postgres.js + ioredis (Node-only).
  runtime: "nodejs",
  matcher: ["/((?!api/|_next/|_static/|[\\w-]+\\.\\w+).*)"],
};

export default async function middleware(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl;
  const host = (req.headers.get("host") ?? "").split(":")[0] ?? "";

  const isRoot = host === ROOT || host === `www.${ROOT}`;
  const sub = host.endsWith(`.${ROOT}`) ? host.slice(0, -(ROOT.length + 1)) : null;

  if (isRoot) return NextResponse.next(); // marketing
  if (sub === "app") {
    return NextResponse.rewrite(new URL(`/platform${url.pathname}`, req.url));
  }
  if (sub === "admin") {
    return NextResponse.rewrite(new URL(`/admin${url.pathname}`, req.url));
  }

  const tenant = await resolveTenantByHost(host);
  if (!tenant) {
    return NextResponse.rewrite(new URL("/store-not-found", req.url));
  }
  return NextResponse.rewrite(new URL(`/_sites/${tenant.slug}${url.pathname}`, req.url));
}
