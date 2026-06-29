// Host -> tenant resolution with a Redis cache in front of the DB lookup.
//
// Cache key:  domain:{host}
//   - hit  "MISS" sentinel  -> known-unknown host (short TTL, avoids hammering)
//   - hit  JSON {id,slug,businessType} -> resolved tenant
//   - miss -> asPlatformAdmin lookup of verified tenant_domain ⋈ tenant
//
// Lookups run via asPlatformAdmin (not withTenant): we don't yet know the
// tenant, and tenant_domain is RLS-scoped, so platform-admin context is the
// only correct path. invalidateDomainCache exists for Phase 2 domain changes.
import { asPlatformAdmin } from "@hybrid/db";
import { getCache } from "@/lib/redis/client";

export type BusinessType = "retail" | "wholesale" | "both";

export interface ResolvedTenant {
  id: string;
  slug: string;
  businessType: BusinessType;
}

const TTL_HIT_SECONDS = 60 * 60; // 1h for resolved hosts
const TTL_MISS_SECONDS = 60; // 60s negative cache
const MISS_SENTINEL = "MISS";

function key(host: string): string {
  return `domain:${host}`;
}

export async function resolveTenantByHost(host: string): Promise<ResolvedTenant | null> {
  // Cache is a best-effort accelerator: a Redis outage must NOT 500 the
  // storefront, so reads/writes are wrapped and fall through to the DB lookup.
  const cached = await cacheGet(key(host));
  if (cached === MISS_SENTINEL) return null;
  if (cached) return JSON.parse(cached) as ResolvedTenant;

  // Only resolve a tenant whose store is actually live. The store is LIVE for
  // active/trial/past_due (trial sellers' subdomains must work during the
  // 14-day trial and the 3-day past_due grace — see lib/billing/status.ts) and
  // goes dark only when suspended/cancelled, which must hit store-not-found and
  // must not be cached as a valid hit. The billing sweep busts the domain cache
  // on suspension so a previously-cached live hit doesn't outlive going dark.
  const rows = await asPlatformAdmin((tx) =>
    tx<{ id: string; slug: string; business_type: string }[]>`
      select t.id, t.slug, coalesce(t.business_type, 'retail') as business_type
      from tenant_domain d
      join tenant t on t.id = d.tenant_id
      where d.domain = ${host} and d.verified = true
        and t.status in ('active', 'trial', 'past_due')
      limit 1
    `,
  );

  const tenant = rows[0] ?? null;
  if (!tenant) {
    await cacheSet(key(host), MISS_SENTINEL, TTL_MISS_SECONDS);
    return null;
  }

  const resolved: ResolvedTenant = {
    id: tenant.id,
    slug: tenant.slug,
    businessType: (tenant.business_type as BusinessType) ?? "retail",
  };
  await cacheSet(key(host), JSON.stringify(resolved), TTL_HIT_SECONDS);
  return resolved;
}

// Cache failures degrade to "miss" / no-op so the DB remains the source of
// truth. We don't log per-request to avoid noise under a sustained outage.
async function cacheGet(k: string): Promise<string | null> {
  try {
    return await getCache().get(k);
  } catch {
    return null;
  }
}

async function cacheSet(k: string, value: string, ttlSeconds: number): Promise<void> {
  try {
    await getCache().set(k, value, ttlSeconds);
  } catch {
    // best-effort; ignore
  }
}

// Called when a domain is added/verified/removed (Phase 2).
export async function invalidateDomainCache(host: string): Promise<void> {
  await getCache().del(key(host));
}
