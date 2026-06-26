import { asPlatformAdmin } from "@hybrid/db";

// Cross-tenant reads for sitemap generation. Uses asPlatformAdmin so RLS is
// bypassed (we genuinely need every tenant's subdomain). Only used at sitemap
// build time, never at request-time.
//
// Schema (see packages/db/sql/01_schema.sql):
//   tenant: id, slug, status (tenant_status), default_locale, ...
//   tenant_domain: tenant_id, domain, type ('subdomain'|'custom'), is_primary

export type TenantForSitemap = {
  subdomain: string;
  updatedAt?: Date;
};

export async function getActiveTenants(): Promise<TenantForSitemap[]> {
  return asPlatformAdmin(async (tx) => {
    // Only primary subdomains of active tenants. Custom domains come later
    // (Vercel-for-Platforms path) — we list them separately when active.
    const rows = await tx<
      { subdomain: string; updatedAt: Date | null }[]
    >`
      SELECT
        d.domain AS subdomain,
        t.updated_at AS "updatedAt"
      FROM tenant t
      INNER JOIN tenant_domain d ON d.tenant_id = t.id
      WHERE t.status = 'active'
        AND d.is_primary = true
        AND d.verified = true
        AND d.type = 'subdomain'
      ORDER BY t.updated_at DESC NULLS LAST
      LIMIT 5000
    `;
    return rows.map((r) => ({ subdomain: r.subdomain, updatedAt: r.updatedAt ?? undefined }));
  });
}