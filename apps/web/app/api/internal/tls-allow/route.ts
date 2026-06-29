import { NextResponse, type NextRequest } from "next/server";
import { resolveTenantByHost } from "@/lib/tenant/resolve";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Caddy on-demand-TLS gate (Caddyfile global `on_demand_tls { ask ... }`).
//
// Before Caddy obtains a Let's Encrypt certificate for a tenant storefront
// subdomain it has never seen, it calls GET /api/internal/tls-allow?domain=<sni>.
// We return 200 ONLY when the host resolves to a real tenant — otherwise an
// attacker could point arbitrary *.hybrid.ecomex.cloud names at the box and
// exhaust the LE issuance rate limit. resolveTenantByHost covers both the
// subdomain model and verified custom domains, and is Redis-cached, so this is
// cheap on the hot path. No secret needed: it is called server-to-server on the
// docker network and only reveals what a normal storefront 200/404 already does.
// Fixed platform hosts. They each have their own explicit Caddy site block, but
// because they also match the wildcard *.hybrid.ecomex.cloud block they inherit
// its on_demand TLS policy — so the ask gate is consulted for them too. They are
// NOT tenants (resolveTenantByHost returns null), so allowlist them explicitly or
// Caddy refuses to serve their (already-issued) certs.
const PLATFORM_HOSTS = new Set([
  "hybrid.ecomex.cloud",
  "admin.hybrid.ecomex.cloud",
  "app.hybrid.ecomex.cloud",
  "cdn.hybrid.ecomex.cloud",
  // Hybrid Pay (self-hosted PipraPay engine) — its own container behind Caddy.
  "pay.hybrid.ecomex.cloud",
]);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const domain = req.nextUrl.searchParams.get("domain")?.trim().toLowerCase();
  if (!domain) {
    return new NextResponse("missing domain", { status: 400 });
  }
  if (PLATFORM_HOSTS.has(domain)) {
    return new NextResponse("ok", { status: 200 });
  }
  const tenant = await resolveTenantByHost(domain);
  return tenant
    ? new NextResponse("ok", { status: 200 })
    : new NextResponse("unknown host", { status: 404 });
}
