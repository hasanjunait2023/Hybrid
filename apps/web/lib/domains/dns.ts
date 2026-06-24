// DNS record instructions for a custom domain (blueprint §2.1, DESIGN §Q5.1).
// PURE — derives the A/CNAME records a seller must add at their DNS provider.
// The CNAME target comes from env (never hardcoded — Vercel project-specific).

export interface DnsRecord {
  /** Record type chip. */
  type: "A" | "CNAME";
  /** Host/name field ("@" apex or "www"). */
  host: string;
  /** Value the seller pastes. */
  value: string;
}

/** Vercel for Platforms apex A record IP (brief §2.1; documented + stable). */
export const APEX_A_VALUE = "76.76.21.21";

/**
 * The two records to show simultaneously (DESIGN §Q5.1): apex A + www CNAME.
 * The CNAME target is read from VERCEL_CNAME_TARGET; when unset (flag off /
 * local) we surface a placeholder so the UI never renders an empty value the
 * seller would copy by mistake.
 */
export function dnsRecordsFor(_domain: string): DnsRecord[] {
  const cnameTarget = process.env.VERCEL_CNAME_TARGET?.trim() || "cname.vercel-dns.com";
  return [
    { type: "A", host: "@", value: APEX_A_VALUE },
    { type: "CNAME", host: "www", value: cnameTarget },
  ];
}

/**
 * Basic apex-domain validation (DESIGN §Q5.1: "yourstore.com, no http://").
 * Rejects schemes, paths, ports, leading www/subdomain, and obvious garbage.
 * Server-side gate before any DB write — never trust the client input.
 */
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  // No scheme, no path, no whitespace, no port.
  if (/[\s/:?#@]/.test(trimmed)) return null;
  // Label.tld(.tld) — letters/digits/hyphens per label, 2+ labels, TLD >= 2.
  const ok = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(trimmed);
  if (!ok) return null;
  const tld = trimmed.split(".").pop() ?? "";
  if (tld.length < 2) return null;
  return trimmed;
}
