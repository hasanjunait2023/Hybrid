// Custom-domain read layer (blueprint §2.1). All reads via withTenant (RLS) —
// tenant_domain is in the tenant-isolation loop. Returns the seller-facing view
// model: each custom domain with its derived connection state + DNS records.
import "server-only";
import { withTenant } from "@hybrid/db";
import { deriveDomainState, type DomainState, type SslStatus } from "./state";
import { dnsRecordsFor, type DnsRecord } from "./dns";

export interface CustomDomainView {
  id: string;
  domain: string;
  isPrimary: boolean;
  state: DomainState;
  records: DnsRecord[];
}

export interface DomainsView {
  /** The always-present verified primary subdomain (fallback URL), read-only. */
  subdomain: string | null;
  custom: CustomDomainView[];
}

interface DomainRow {
  id: string;
  domain: string;
  type: "subdomain" | "custom";
  is_primary: boolean;
  verified: boolean;
  ssl_status: SslStatus;
}

export async function getDomainsView(tenantId: string, userId: string): Promise<DomainsView> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<DomainRow[]>`
      select id, domain, type, is_primary, verified, ssl_status
      from tenant_domain
      order by type asc, created_at asc
    `,
  );

  const subdomain =
    rows.find((r) => r.type === "subdomain" && r.is_primary) ??
    rows.find((r) => r.type === "subdomain");

  const custom = rows
    .filter((r) => r.type === "custom")
    .map((r) => ({
      id: r.id,
      domain: r.domain,
      isPrimary: r.is_primary,
      state: deriveDomainState({ verified: r.verified, sslStatus: r.ssl_status }),
      records: dnsRecordsFor(r.domain),
    }));

  return { subdomain: subdomain?.domain ?? null, custom };
}
