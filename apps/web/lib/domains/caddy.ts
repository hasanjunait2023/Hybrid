// Self-hosted DNS-based domain verification — replaces lib/domains/vercel.ts for
// Caddy deployments. No external API; uses Node dns.promises directly.
//
// Verification flow:
//   1. Seller adds TXT record:  _hybrid-verify.{domain} = {verification_token}
//   2. Seller adds A record:    {domain} = CUSTOM_DOMAIN_VPS_IP (our VPS)
//   3. Seller clicks "Check Status" → this module resolves both records
//   4. TXT passes → verified=true, ssl_status='pending' (dns_verified state)
//   5. TXT + A pass → verified=true, ssl_status='issued' (ssl_issued state;
//      Caddy's on-demand TLS + ask gate provisions the Let's Encrypt cert
//      automatically on the first real HTTPS connection)
//
// Never throws to the caller — DNS failures are caught and returned as false.
import "server-only";
import { promises as dns } from "node:dns";

export const TXT_RECORD_PREFIX = "_hybrid-verify";

// The VPS public IP that tenant A records must point to. Override in production
// via CUSTOM_DOMAIN_VPS_IP if the VPS IP changes.
export function getVpsIp(): string {
  return process.env.CUSTOM_DOMAIN_VPS_IP?.trim() || "72.62.228.196";
}

export interface DnsCheckResult {
  /** Seller has added the TXT record with the correct token (ownership proof). */
  txtVerified: boolean;
  /** Seller has pointed the A record at our VPS (routing ready). */
  aVerified: boolean;
  /**
   * Domain is fully live: ownership proven + routing to our VPS.
   * When true, Caddy's ask gate will return 200 and provision the cert on first hit.
   */
  sslIssued: boolean;
}

/**
 * Verify a custom domain by checking its DNS records.
 * Both checks run concurrently (neither depends on the other's result).
 */
export async function checkDomainDns(
  domain: string,
  verificationToken: string,
): Promise<DnsCheckResult> {
  const [txtVerified, aVerified] = await Promise.all([
    checkTxtRecord(domain, verificationToken),
    checkARecord(domain),
  ]);
  return { txtVerified, aVerified, sslIssued: txtVerified && aVerified };
}

async function checkTxtRecord(domain: string, token: string): Promise<boolean> {
  try {
    const records = await dns.resolveTxt(`${TXT_RECORD_PREFIX}.${domain}`);
    // resolveTxt returns string[][] (each TXT record can have multiple chunks).
    return records.flat().some((chunk) => chunk === token);
  } catch {
    return false;
  }
}

async function checkARecord(domain: string): Promise<boolean> {
  try {
    const addrs = await dns.resolve4(domain);
    return addrs.includes(getVpsIp());
  } catch {
    return false;
  }
}
