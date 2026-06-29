// Tenant business_type resolver (Phase 3 — wholesale storefront routing).
// Reads tenant.business_type via asPlatformAdmin (tenant metadata is not
// RLS-scoped — same rationale as resolve.ts and getTenantContextBySlug).
import { asPlatformAdmin } from "@hybrid/db";

export type BusinessType = "retail" | "wholesale" | "both";

/**
 * Resolve a tenant's business_type by slug.
 * Returns 'retail' as the safe default when the tenant is not found.
 */
export async function getTenantBusinessTypeBySlug(
  slug: string,
): Promise<BusinessType> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ business_type: BusinessType }[]>`
      select business_type
        from tenant
       where slug = ${slug}
         and status in ('active', 'trial', 'past_due')
       limit 1
    `,
  );
  return rows[0]?.business_type ?? "retail";
}

/**
 * Resolve a tenant's business_type by id.
 * Returns 'retail' as the safe default when the tenant is not found.
 */
export async function getTenantBusinessTypeById(
  tenantId: string,
): Promise<BusinessType> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ business_type: BusinessType }[]>`
      select business_type
        from tenant
       where id = ${tenantId}
         and status in ('active', 'trial', 'past_due')
       limit 1
    `,
  );
  return rows[0]?.business_type ?? "retail";
}
