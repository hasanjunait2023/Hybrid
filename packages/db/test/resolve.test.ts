// ============================================================================
// Host -> tenant resolution integration suite (FIX 10 — trial-liveness QA gap).
//
// Runs against the SAME ephemeral embedded Postgres as the RLS / provision gates
// (global-setup.ts), through the REAL asPlatformAdmin. Imports resolveTenantByHost
// straight from apps/web/lib/tenant/resolve.ts ("@/..." is aliased to apps/web in
// vitest.config.ts).
//
// Proves the headline E2E's first leg — a store is LIVE during its trial:
//   1. A verified-domain tenant in status 'trial' resolves (store live in trial).
//   2. The same tenant flipped to 'suspended' resolves to null (store dark).
//   3. ... and 'cancelled' resolves to null too.
//
// REDIS CACHE: resolve.ts puts a Redis cache in front of the DB lookup, but it is
// strictly best-effort — every cache get/set is wrapped and falls through to the
// DB on error (lib/tenant/resolve.ts cacheGet/cacheSet). With no REDIS_URL set,
// getCache() throws inside those guards and is swallowed, so EVERY call hits the
// DB fresh. We delete REDIS_URL up front to pin that real DB-fallback path, which
// also makes the status-flip assertions deterministic (no cached hit to outlive
// the flip). ASCII-only fixtures (embedded-pg is WIN1252 on Windows).
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";

// Force the DB-fallback path: no Redis in the test harness. Must be cleared
// before resolve.ts is imported (getCache reads REDIS_URL lazily, but pin early).
delete process.env.REDIS_URL;

// provisionTenant writes "{slug}.{NEXT_PUBLIC_ROOT_DOMAIN}" as the verified
// subdomain; resolve.ts matches on that exact host. Pin the root before import.
process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";

import { provisionTenant, createAppUser } from "../../../apps/web/lib/auth/provision";
import { resolveTenantByHost } from "../../../apps/web/lib/tenant/resolve";

const RUN = Date.now().toString(36);
const SLUG = `resolve-${RUN}`;
const HOST = `${SLUG}.myhybrid.com`;
const EMAIL_OWNER = `resolve-owner-${RUN}@resolve.test`;

let tenantId: string;

async function setTenantStatus(status: string): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`update tenant set status = ${status}::tenant_status where id = ${tenantId}`;
  });
}

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    // tenant cascade removes tenant_domain / tenant_member / subscription.
    await tx`delete from tenant where slug = ${SLUG}`;
    await tx`delete from app_user where email = ${EMAIL_OWNER}`;
  });
}

describe("resolveTenantByHost — trial liveness", () => {
  beforeAll(async () => {
    await cleanup();
    const owner = await createAppUser({ email: EMAIL_OWNER, fullName: "Resolve Owner" });
    // provisionTenant creates the tenant in status 'trial' with a verified,
    // primary subdomain — exactly the headline E2E's starting state.
    const result = await provisionTenant({
      userId: owner.userId,
      storeName: "Resolve Test Store",
      slug: SLUG,
    });
    tenantId = result.tenantId;
  });

  afterAll(cleanup);

  it("1. resolves a verified-domain tenant in status 'trial' (store LIVE during trial)", async () => {
    const resolved = await resolveTenantByHost(HOST);
    expect(resolved).not.toBeNull();
    expect(resolved?.id).toBe(tenantId);
    expect(resolved?.slug).toBe(SLUG);
  });

  it("2. returns null for a 'suspended' tenant (store dark)", async () => {
    await setTenantStatus("suspended");
    const resolved = await resolveTenantByHost(HOST);
    expect(resolved).toBeNull();
  });

  it("3. returns null for a 'cancelled' tenant (store dark)", async () => {
    await setTenantStatus("cancelled");
    const resolved = await resolveTenantByHost(HOST);
    expect(resolved).toBeNull();
  });

  it("4. returns null for an unknown host", async () => {
    const resolved = await resolveTenantByHost(`nope-${RUN}.myhybrid.com`);
    expect(resolved).toBeNull();
  });

  // --- Custom domains (S-DOMAINS): resolveTenantByHost routes a VERIFIED
  // tenant_domain of type 'custom' exactly like a subdomain, and stays
  // fail-closed for an unverified one. ---------------------------------------
  const CUSTOM_HOST = `shop-${RUN}.example.com`;
  const UNVERIFIED_HOST = `pending-${RUN}.example.com`;

  it("5. resolves a VERIFIED custom domain to its tenant (active store)", async () => {
    // Re-activate the tenant first (prior cases left it 'cancelled').
    await setTenantStatus("active");
    await asPlatformAdmin(async (tx) => {
      await tx`
        insert into tenant_domain (tenant_id, domain, type, verified, ssl_status)
        values (${tenantId}, ${CUSTOM_HOST}, 'custom', true, 'issued')
        on conflict (domain) do nothing
      `;
    });
    const resolved = await resolveTenantByHost(CUSTOM_HOST);
    expect(resolved).not.toBeNull();
    expect(resolved?.id).toBe(tenantId);
    expect(resolved?.slug).toBe(SLUG);
  });

  it("6. returns null for an UNVERIFIED custom domain (fail-closed)", async () => {
    await asPlatformAdmin(async (tx) => {
      await tx`
        insert into tenant_domain (tenant_id, domain, type, verified, ssl_status)
        values (${tenantId}, ${UNVERIFIED_HOST}, 'custom', false, 'none')
        on conflict (domain) do nothing
      `;
    });
    const resolved = await resolveTenantByHost(UNVERIFIED_HOST);
    expect(resolved).toBeNull();
  });

  it("7. a verified custom domain goes dark when the tenant is suspended", async () => {
    await setTenantStatus("suspended");
    const resolved = await resolveTenantByHost(CUSTOM_HOST);
    expect(resolved).toBeNull();
  });
});
