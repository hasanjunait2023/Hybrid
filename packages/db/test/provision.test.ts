// ============================================================================
// Auth-provisioning integration suite — provisionTenant atomicity.
//
// Runs against the SAME ephemeral embedded Postgres as the RLS / commerce gates
// (global-setup.ts), through the REAL asPlatformAdmin. Imports the provisioning
// core straight from apps/web/lib/auth/provision.ts — "@hybrid/db" is aliased to
// ../src/index.ts in vitest.config.ts so it resolves here.
//
// Proves (blueprint lib/auth/provision.ts + "Sacred invariants"):
//   1. provisionTenant creates tenant + tenant_domain + tenant_member +
//      subscription atomically with the GATE-1 defaults (trial, starter plan,
//      +14d trial/subscription window, owner membership, verified subdomain).
//   2. createAppUser (dev path) yields a real app_user the provisioner can own.
//   3. A duplicate slug is rejected with the friendly Bengali SlugTakenError and
//      leaves NO partial tenant behind (transaction rolled back).
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";

// provision.ts reads NEXT_PUBLIC_ROOT_DOMAIN for the subdomain it writes. Set it
// before importing the module under test (it is read per-call, but pin it early).
process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";

import {
  provisionTenant,
  createAppUser,
  SlugTakenError,
} from "../../../apps/web/lib/auth/provision";

// Unique slugs/emails per run so re-runs against a persisted DB stay clean; the
// embedded DB is fresh each run, but uniqueness keeps the suite order-independent.
const RUN = Date.now().toString(36);
const SLUG_OK = `prov-ok-${RUN}`;
const SLUG_DUP = `prov-dup-${RUN}`;
const EMAIL_OWNER = `owner-${RUN}@provision.test`;

let ownerId: string;

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    // tenant cascade removes tenant_domain / tenant_member / subscription.
    await tx`delete from tenant where slug in (${SLUG_OK}, ${SLUG_DUP})`;
    await tx`delete from app_user where email = ${EMAIL_OWNER}`;
  });
}

describe("auth provisioning — provisionTenant", () => {
  beforeAll(async () => {
    await cleanup();
    ownerId = await createAppUser({
      email: EMAIL_OWNER,
      fullName: "Provision Owner",
      phone: "01711000000",
    });
    expect(ownerId).toBeTruthy();
  });

  afterAll(cleanup);

  it("1. createAppUser is idempotent on email", async () => {
    const again = await createAppUser({ email: EMAIL_OWNER });
    expect(again).toBe(ownerId);
  });

  it("2. provisions tenant + domain + member + subscription atomically with defaults", async () => {
    const result = await provisionTenant({
      userId: ownerId,
      storeName: "Provision Test Store",
      slug: SLUG_OK,
    });

    expect(result.slug).toBe(SLUG_OK);
    expect(result.tenantId).toBeTruthy();

    const snapshot = await asPlatformAdmin(async (tx) => {
      const tenant = await tx<
        {
          id: string;
          slug: string;
          name: string;
          status: string;
          owner_user_id: string;
          default_locale: string;
          plan_code: string;
          trial_days: string;
        }[]
      >`
        select t.id, t.slug, t.name, t.status, t.owner_user_id, t.default_locale,
               p.code as plan_code,
               round(extract(epoch from (t.trial_ends_at - now())) / 86400) as trial_days
          from tenant t join plan p on p.id = t.plan_id
         where t.id = ${result.tenantId}
      `;
      const domain = await tx<
        { domain: string; type: string; is_primary: boolean; verified: boolean }[]
      >`
        select domain, type, is_primary, verified
          from tenant_domain where tenant_id = ${result.tenantId}
      `;
      const member = await tx<
        { user_id: string; role: string; accepted_at: string | null }[]
      >`
        select user_id, role, accepted_at
          from tenant_member where tenant_id = ${result.tenantId}
      `;
      const sub = await tx<
        {
          status: string;
          billing_provider: string;
          plan_code: string;
          period_days: string;
        }[]
      >`
        select s.status, s.billing_provider, p.code as plan_code,
               round(extract(epoch from (s.current_period_end - s.current_period_start)) / 86400) as period_days
          from subscription s join plan p on p.id = s.plan_id
         where s.tenant_id = ${result.tenantId}
      `;
      return { tenant, domain, member, sub };
    });

    // tenant
    const t = snapshot.tenant[0]!;
    expect(t.status).toBe("trial");
    expect(t.owner_user_id).toBe(ownerId);
    expect(t.default_locale).toBe("bn");
    expect(t.name).toBe("Provision Test Store");
    expect(t.plan_code).toBe("starter");
    expect(Number(t.trial_days)).toBe(14);

    // domain
    expect(snapshot.domain).toHaveLength(1);
    const d = snapshot.domain[0]!;
    expect(d.domain).toBe(`${SLUG_OK}.myhybrid.com`);
    expect(d.type).toBe("subdomain");
    expect(d.is_primary).toBe(true);
    expect(d.verified).toBe(true);

    // member
    expect(snapshot.member).toHaveLength(1);
    const m = snapshot.member[0]!;
    expect(m.user_id).toBe(ownerId);
    expect(m.role).toBe("owner");
    expect(m.accepted_at).not.toBeNull();

    // subscription
    expect(snapshot.sub).toHaveLength(1);
    const s = snapshot.sub[0]!;
    expect(s.status).toBe("trialing");
    expect(s.billing_provider).toBe("manual");
    expect(s.plan_code).toBe("starter");
    expect(Number(s.period_days)).toBe(14);
  });

  it("3. duplicate slug throws SlugTakenError and leaves no partial tenant", async () => {
    await provisionTenant({ userId: ownerId, storeName: "First", slug: SLUG_DUP });

    await expect(
      provisionTenant({ userId: ownerId, storeName: "Second", slug: SLUG_DUP }),
    ).rejects.toBeInstanceOf(SlugTakenError);

    // Exactly one tenant for that slug — the failed second insert rolled back.
    const count = await asPlatformAdmin((tx) =>
      tx<{ n: number }[]>`select count(*)::int as n from tenant where slug = ${SLUG_DUP}`,
    );
    expect(count[0]!.n).toBe(1);
  });
});
