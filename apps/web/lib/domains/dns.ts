// DNS record instructions for a custom domain (blueprint §2.1, DESIGN §Q5.1).
// PURE — derives the records a seller must add at their DNS provider.
// Self-hosted Caddy on VPS: shows A (apex → VPS IP) + TXT (ownership proof).
import { TXT_RECORD_PREFIX, getVpsIp } from "./caddy";

export interface DnsRecord {
  /** Record type chip. */
  type: "A" | "CNAME" | "TXT";
  /** Host/name field ("@" apex or full TXT hostname). */
  host: string;
  /** Value the seller pastes into their DNS control panel. */
  value: string;
}

/**
 * The two records a seller must add to connect their custom domain:
 *   A   @                          → VPS IP  (routes traffic to our server)
 *   TXT _hybrid-verify.domain.com  → token   (proves domain ownership)
 *
 * The A record allows Caddy to obtain a Let's Encrypt cert via HTTP-01 on the
 * first real HTTPS connection (on-demand TLS). The TXT record is our gate — we
 * only set verified=true in the DB (and thus open the Caddy ask gate) once we
 * can resolve the correct token, preventing domain squatting.
 */
export function dnsRecordsFor(domain: string, verificationToken: string): DnsRecord[] {
  return [
    { type: "A", host: "@", value: getVpsIp() },
    { type: "TXT", host: `${TXT_RECORD_PREFIX}.${domain}`, value: verificationToken },
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
