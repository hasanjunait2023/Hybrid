// ============================================================================
// Tenant business-type split suite. Proves the retailer/wholesaler split's
// foundation: provisionTenant records the chosen business_type, a wholesaler is
// created KYC-pending + unapproved, and both type resolvers (used by the admin
// and storefront boundary guards) return the right value. Isolated on freshly
// provisioned tenants.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";

process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";

import { provisionTenant, createAppUser } from "../../../apps/web/lib/auth/provision";
import { getTenantBusinessType } from "../../../apps/web/lib/admin/wholesale";
import {
  getTenantBusinessTypeBySlug,
  getTenantBusinessTypeById,
} from "../../../apps/web/lib/tenant/businessType";

const RUN = Date.now().toString(36);
const R_SLUG = `type-retail-${RUN}`;
const W_SLUG = `type-whole-${RUN}`;
const R_EMAIL = `type-retail-${RUN}@store.test`;
const W_EMAIL = `type-whole-${RUN}@store.test`;

let retailId = "";
let wholeId = "";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from tenant where slug in (${R_SLUG}, ${W_SLUG})`;
    await tx`delete from app_user where email in (${R_EMAIL}, ${W_EMAIL})`;
  });
}

describe("Tenant business-type split", () => {
  beforeAll(async () => {
    await cleanup();
    const rOwner = await createAppUser({ email: R_EMAIL, fullName: "Retail Owner" });
    const wOwner = await createAppUser({ email: W_EMAIL, fullName: "Whole Owner" });
    retailId = (await provisionTenant({ userId: rOwner.userId, storeName: "Retail Store", slug: R_SLUG })).tenantId;
    wholeId = (
      await provisionTenant({
        userId: wOwner.userId,
        storeName: "Whole Store",
        slug: W_SLUG,
        businessType: "wholesale",
      })
    ).tenantId;
  });

  afterAll(cleanup);

  it("1. a default signup is a retailer; resolvers agree", async () => {
    expect(await getTenantBusinessType(retailId)).toBe("retail");
    expect(await getTenantBusinessTypeById(retailId)).toBe("retail");
    expect(await getTenantBusinessTypeBySlug(R_SLUG)).toBe("retail");
  });

  it("2. a wholesaler signup records business_type='wholesale', KYC-pending, unapproved", async () => {
    expect(await getTenantBusinessType(wholeId)).toBe("wholesale");
    expect(await getTenantBusinessTypeBySlug(W_SLUG)).toBe("wholesale");

    const row = await asPlatformAdmin((tx) =>
      tx<{ kyc_status: string; wholesale_approved: boolean }[]>`
        select kyc_status, wholesale_approved from tenant where id = ${wholeId}
      `,
    );
    // Self-selected wholesaler must wait for platform KYC approval.
    expect(row[0]?.kyc_status).toBe("pending");
    expect(row[0]?.wholesale_approved).toBe(false);
  });

  it("3. resolvers default to 'retail' for an unknown tenant (safe boundary default)", async () => {
    expect(await getTenantBusinessTypeBySlug("no-such-tenant-xyz")).toBe("retail");
  });
});
