// ============================================================================
// CRM loyalty redemption loop (Phase R1.6). Proves the now-wired loyalty cycle:
// earn-on-delivery (awardForOrder, idempotent via the earn-once index), the
// balance surfacing through getCustomer360, and staff redemption (redeem,
// balance-validated, never negative). Isolated on a freshly provisioned tenant.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";

process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";

import { provisionTenant, createAppUser } from "../../../apps/web/lib/auth/provision";
import { placeOrder } from "@/lib/commerce/placeOrder";
import { updateProgram, awardForOrder, redeem, getBalance, LoyaltyError } from "@/lib/admin/loyalty";
import { getCustomer360 } from "@/lib/admin/customers";

const RUN = Date.now().toString(36);
const SLUG = `loy-${RUN}`;
const EMAIL = `loy-${RUN}@store.test`;
const PHONE = "01988000222";

let tenantId = "";
let userId = "";
let customerId = "";
let orderId = "";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from loyalty_ledger where tenant_id = ${tenantId}`;
    await tx`delete from loyalty_program where tenant_id = ${tenantId}`;
    await tx`delete from payment where tenant_id = ${tenantId}`;
    await tx`delete from order_item where tenant_id = ${tenantId}`;
    await tx`delete from orders where tenant_id = ${tenantId}`;
    await tx`delete from order_counter where tenant_id = ${tenantId}`;
    await tx`delete from customer where tenant_id = ${tenantId}`;
    await tx`delete from tenant where slug = ${SLUG}`;
    await tx`delete from app_user where email = ${EMAIL}`;
  });
}

describe("CRM loyalty redemption loop", () => {
  beforeAll(async () => {
    userId = (await createAppUser({ email: EMAIL, fullName: "Loyalty Vendor" })).userId;
    tenantId = (await provisionTenant({ userId, storeName: "Loyalty Vendor", slug: SLUG, businessType: "retail" })).tenantId;

    // Program: 1 point per 100 BDT, each point worth ৳2 on redemption.
    await updateProgram(tenantId, userId, { enabled: true, earnPer100: 1, takaPerPoint: 2 });

    const variantId = await asPlatformAdmin(async (tx) => {
      const p = await tx<{ id: string }[]>`
        insert into product (tenant_id, title, slug, status)
        values (${tenantId}, 'Loyalty Widget', 'loyalty-widget', 'active') returning id`;
      const v = await tx<{ id: string }[]>`
        insert into product_variant (tenant_id, product_id, title, price, inventory_quantity, track_inventory)
        values (${tenantId}, ${p[0]!.id}, 'Default', 1000, 100, true) returning id`;
      return v[0]!.id;
    });

    const placed = await placeOrder({
      tenantId,
      userId,
      customer: { phone: PHONE, name: "Loyal Buyer" },
      shippingAddress: { recipient: "Loyal Buyer", phone: PHONE, division: "Dhaka", district: "Dhaka", thana: "Mirpur", line: "Rd 9" },
      items: [{ variantId, quantity: 1 }],
      paymentMethod: "cod",
      source: "manual",
      shippingTotal: 0,
    });
    orderId = placed.orderId;
    customerId = await asPlatformAdmin(async (tx) => {
      const r = await tx<{ id: string }[]>`select id from customer where phone = ${PHONE} limit 1`;
      return r[0]!.id;
    });
  });

  afterAll(cleanup);

  it("1. earn-on-delivery awards points, and is idempotent", async () => {
    // grand_total = 1000 → floor(1000/100) * 1 = 10 points.
    const earned = await awardForOrder(tenantId, userId, customerId, orderId, 1000);
    expect(earned).toBe(10);
    expect(await getBalance(tenantId, userId, customerId)).toBe(10);

    // A repeat delivery of the same order awards nothing (earn-once index).
    const again = await awardForOrder(tenantId, userId, customerId, orderId, 1000);
    expect(again).toBe(0);
    expect(await getBalance(tenantId, userId, customerId)).toBe(10);
  });

  it("2. the balance surfaces on Customer 360", async () => {
    const c = await getCustomer360(tenantId, userId, customerId);
    expect(c!.loyaltyPoints).toBe(10);
  });

  it("3. redeem decrements the balance and returns taka value", async () => {
    const res = await redeem(tenantId, userId, customerId, 4);
    expect(res.takaValue).toBe(8); // 4 points * ৳2
    expect(res.balance).toBe(6);
    expect(await getBalance(tenantId, userId, customerId)).toBe(6);
  });

  it("4. redeeming more than the balance is refused", async () => {
    await expect(redeem(tenantId, userId, customerId, 999)).rejects.toBeInstanceOf(LoyaltyError);
    // Balance unchanged after the failed redeem.
    expect(await getBalance(tenantId, userId, customerId)).toBe(6);
  });

  it("5. an order with the program disabled earns nothing", async () => {
    await updateProgram(tenantId, userId, { enabled: false, earnPer100: 1, takaPerPoint: 2 });
    const earned = await awardForOrder(tenantId, userId, customerId, orderId, 1000);
    expect(earned).toBe(0);
    await updateProgram(tenantId, userId, { enabled: true, earnPer100: 1, takaPerPoint: 2 });
  });
});
