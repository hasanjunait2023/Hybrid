// Host -> tenant resolution with a Redis cache in front of the DB lookup.
//
// Cache key:  domain:{host}
//   - hit  "MISS" sentinel  -> known-unknown host (short TTL, avoids hammering)
//   - hit  JSON {id,slug}   -> resolved tenant
//   - miss -> asPlatformAdmin lookup of verified tenant_domain ⋈ tenant
//
// Lookups run via asPlatformAdmin (not withTenant): we don't yet know the
// tenant, and tenant_domain is RLS-scoped, so platform-admin context is the
// only correct path. invalidateDomainCache exists for Phase 2 domain changes.
import { asPlatformAdmin } from "@hybrid/db";
import { getCache } from "@/lib/redis/client";

export interface ResolvedTenant {
  id: string;
  slug: string;
}

const TTL_HIT_SECONDS = 60 * 60; // 1h for resolved hosts
const TTL_MISS_SECONDS = 60; // 60s negative cache
const MISS_SENTINEL = "MISS";

function key(host: string): string {
  return `domain:${host}`;
}

export async function resolveTenantByHost(host: string): Promise<ResolvedTenant | null> {
  const cache = getCache();
  const cached = await cache.get(key(host));
  if (cached === MISS_SENTINEL) return null;
  if (cached) return JSON.parse(cached) as ResolvedTenant;

  const rows = await asPlatformAdmin((tx) =>
    tx<{ id: string; slug: string }[]>`
      select t.id, t.slug
      from tenant_domain d
      join tenant t on t.id = d.tenant_id
      where d.domain = ${host} and d.verified = true
      limit 1
    `,
  );

  const tenant = rows[0] ?? null;
  if (!tenant) {
    await cache.set(key(host), MISS_SENTINEL, TTL_MISS_SECONDS);
    return null;
  }

  const resolved: ResolvedTenant = { id: tenant.id, slug: tenant.slug };
  await cache.set(key(host), JSON.stringify(resolved), TTL_HIT_SECONDS);
  return resolved;
}

// Called when a domain is added/verified/removed (Phase 2).
export async function invalidateDomainCache(host: string): Promise<void> {
  await getCache().del(key(host));
}
