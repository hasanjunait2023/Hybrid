// Server-derived callback / IPN base URL (blueprint SHIFT 2; DESIGN §Q4.4).
// Nagad/SSLCommerz require the seller to paste the EXACT callback/IPN URL into
// the gateway portal — if it's wrong, payments succeed at the gateway but never
// confirm in Hybrid (a silent, trust-destroying failure). So the URL must be
// SERVER-DERIVED from the tenant's VERIFIED domain, never client-supplied (no
// SSRF / forgery surface).
//
// Precedence: verified primary custom domain → verified primary subdomain →
// any verified domain → the subdomain fallback (NEXT_PUBLIC_ROOT_DOMAIN slug).
import "server-only";
import { withTenant } from "@hybrid/db";

/**
 * Resolve the https base origin from the tenant's VERIFIED domains. Returns null
 * when the tenant has no verified domain yet (UI then shows a "verify a domain
 * first" hint instead of a copyable-but-wrong URL).
 */
export async function getCallbackBaseUrl(
  tenantId: string,
  userId: string,
): Promise<string | null> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ domain: string; type: "subdomain" | "custom"; is_primary: boolean }[]>`
      select domain, type, is_primary
      from tenant_domain
      where verified = true
      order by is_primary desc, (type = 'custom') desc, created_at asc
    `,
  );
  const chosen = rows[0];
  if (!chosen) return null;
  return `https://${chosen.domain}`;
}

/** The IPN/callback path for a given provider (mirrors the Route Handlers). */
export function callbackPath(provider: "nagad" | "sslcommerz" | "bkash"): string {
  if (provider === "nagad") return "/api/payments/nagad/callback";
  if (provider === "sslcommerz") return "/api/payments/sslcommerz/ipn";
  return "/api/bkash/callback";
}

export async function getProviderCallbackUrl(
  tenantId: string,
  userId: string,
  provider: "nagad" | "sslcommerz" | "bkash",
): Promise<string | null> {
  const base = await getCallbackBaseUrl(tenantId, userId);
  if (!base) return null;
  return `${base}${callbackPath(provider)}`;
}
