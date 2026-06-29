// ============================================================================
// Marketplace wholesale order_mode tagging. Proves placeMarketplaceOrder tags a
// vendor sub-order order_mode='wholesale' when its lines are wholesale products
// (so vendor wholesale order lists + platform GMV analytics count them), and
// 'retail' otherwise. Isolated on a freshly provisioned vendor + buyer.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";

process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";

import { provisionTenant, createAppUser } from "../../../apps/web/lib/auth/provision";
import { upsertBuyerByPhone } from "@/lib/marketplace/session";
import { placeMarketplaceOrder } from "@/lib/marketplace/placeMarketplaceOrder";

const RUN = Date.now().toString(36);
const SLUG = `mp-mode-${RUN}`;
const EMAIL = `mp-mode-${RUN}@store.test`;
const PHONE = "+8801955000123";

let tenantId = "";
let userId = "";
let buyerId = "";
let wholesaleVariant = "";
let retailVariant = "";

const contact = { name: "MP Buyer", phone: PHONE };
const shipTo = { division: "Dhaka", district: "Dhaka", thana: "Mirpur", line: "Road 9" };

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    const parents = await tx<{ id: string }[]>`select id from marketplace_order where buyer_id in (select id from marketplace_customer where phone = ${PHONE})`;
    const ids = parents.map((p) => p.id);
    if (ids.length > 0) {
      const orders = await tx<{ id: string }[]>`select id from orders where marketplace_order_id in ${tx(ids)}`;
      const oids = orders.map((o) => o.id);
      if (oids.length > 0) {
        await tx`delete from payment where order_id in ${tx(oids)}`;
        await tx`delete from order_item where order_id in ${tx(oids)}`;
        await tx`delete from orders where id in ${tx(oids)}`;
      }
      await tx`delete from marketplace_commission where marketplace_order_id in ${tx(ids)}`;
      await tx`delete from marketplace_suborder where marketplace_order_id in ${tx(ids)}`;
      await tx`delete from marketplace_order where id in ${tx(ids)}`;
    }
    await tx`delete from marketplace_customer where phone = ${PHONE}`;
    await tx`delete from tenant where slug = ${SLUG}`;
    await tx`delete from app_user where email = ${EMAIL}`;
  });
}

describe("Marketplace wholesale order_mode", () => {
  beforeAll(async () => {
    await cleanup();
    userId = (await createAppUser({ email: EMAIL, fullName: "MP Vendor" })).userId;
    tenantId = (await provisionTenant({ userId, storeName: "MP Vendor", slug: SLUG, businessType: "wholesale" })).tenantId;
    buyerId = await upsertBuyerByPhone(PHONE, "MP Buyer");

    await asPlatformAdmin(async (tx) => {
      // One wholesale product, one retail product, each with an untracked variant.
      const wp = await tx<{ id: string }[]>`
        insert into product (tenant_id, title, slug, status, is_wholesale)
        values (${tenantId}, 'Bulk Rice', 'bulk-rice', 'active', true) returning id`;
      const rp = await tx<{ id: string }[]>`
        insert into product (tenant_id, title, slug, status, is_wholesale)
        values (${tenantId}, 'Single Snack', 'single-snack', 'active', false) returning id`;
      const wv = await tx<{ id: string }[]>`
        insert into product_variant (tenant_id, product_id, price, track_inventory)
        values (${tenantId}, ${wp[0]!.id}, 5000, false) returning id`;
      const rv = await tx<{ id: string }[]>`
        insert into product_variant (tenant_id, product_id, price, track_inventory)
        values (${tenantId}, ${rp[0]!.id}, 100, false) returning id`;
      wholesaleVariant = wv[0]!.id;
      retailVariant = rv[0]!.id;
    });
  });

  afterAll(cleanup);

  async function modeOf(orderId: string): Promise<string> {
    const rows = await asPlatformAdmin((tx) =>
      tx<{ order_mode: string }[]>`select order_mode from orders where id = ${orderId}`,
    );
    return rows[0]!.order_mode;
  }

  it("1. a wholesale-product marketplace sub-order is tagged order_mode='wholesale'", async () => {
    const res = await placeMarketplaceOrder({
      buyerId,
      contact,
      shipTo,
      lines: [{ tenantId, variantId: wholesaleVariant, quantity: 2 }],
    });
    expect(res.confirmed.length).toBe(1);
    expect(await modeOf(res.confirmed[0]!.orderId!)).toBe("wholesale");
  });

  it("2. a retail-product marketplace sub-order stays order_mode='retail'", async () => {
    const res = await placeMarketplaceOrder({
      buyerId,
      contact,
      shipTo,
      lines: [{ tenantId, variantId: retailVariant, quantity: 1 }],
    });
    expect(res.confirmed.length).toBe(1);
    expect(await modeOf(res.confirmed[0]!.orderId!)).toBe("retail");
  });
});
