// Host->tenant cache busting after a tenant status flip (S-PLATFORM / S-BILLING).
//
// resolve.ts caches by DOMAIN (key `domain:{host}`). When a tenant is suspended
// or reactivated, every one of its verified domains must be evicted so the next
// storefront request re-resolves against the new status (a suspended tenant then
// 404s; a reactivated one serves again). Best-effort: a Redis hiccup must not
// fail the status change — the negative/positive cache simply ages out (TTLs in
// resolve.ts are <= 1h).
import { invalidateDomainCache } from "@/lib/tenant/resolve";
import { getTenantDomains } from "@/lib/platform/data";

export async function bustTenantDomainCache(tenantId: string): Promise<void> {
  const domains = await getTenantDomains(tenantId);
  await Promise.all(
    domains.map(async (host) => {
      try {
        await invalidateDomainCache(host);
      } catch {
        // best-effort; TTL will reconcile if the cache is briefly unavailable
      }
    }),
  );
}
