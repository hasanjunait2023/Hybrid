// ============================================================================
// Customer 360 unified timeline (CRM Phase R1.1). Proves getCustomer360 merges
// every touchpoint — orders, payments, ledger (বাকি), notes, returns — into one
// chronological feed, and derives the CRM signals a seller acts on: AOV, last
// order, RFM-lite segment, and outstanding due (latest ledger balance).
// Isolated on a freshly provisioned tenant so the shared fixtures don't bleed in.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin, withTenant } from "../src/index";

process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";

import { provisionTenant, createAppUser } from "../../../apps/web/lib/auth/provision";
import { placeOrder } from "@/lib/commerce/placeOrder";
import { getCustomer360 } from "@/lib/admin/customers";

const RUN = Date.now().toString(36);
const SLUG = `c360-${RUN}`;
const EMAIL = `c360-${RUN}@store.test`;
const PHONE = "01933000777";

let tenantId = "";
let userId = "";
let customerId = "";
let orderId = "";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from payment where tenant_id = ${tenantId}`;
    await tx`delete from return_request where tenant_id = ${tenantId}`;
    await tx`delete from order_note where tenant_id = ${tenantId}`;
    await tx`delete from customer_ledger where tenant_id = ${tenantId}`;
    await tx`delete from order_item where tenant_id = ${tenantId}`;
    await tx`delete from orders where tenant_id = ${tenantId}`;
    await tx`delete from order_counter where tenant_id = ${tenantId}`;
    await tx`delete from customer_address where tenant_id = ${tenantId}`;
    await tx`delete from customer where tenant_id = ${tenantId}`;
    await tx`delete from tenant where slug = ${SLUG}`;
    await tx`delete from app_user where email = ${EMAIL}`;
  });
}

describe("Customer 360 unified timeline", () => {
  beforeAll(async () => {
    userId = (await createAppUser({ email: EMAIL, fullName: "C360 Vendor" })).userId;
    tenantId = (await provisionTenant({ userId, storeName: "C360 Vendor", slug: SLUG, businessType: "retail" })).tenantId;

    // A product + variant to order.
    const variantId = await asPlatformAdmin(async (tx) => {
      const p = await tx<{ id: string }[]>`
        insert into product (tenant_id, title, slug, status)
        values (${tenantId}, 'C360 Widget', 'c360-widget', 'active') returning id`;
      const v = await tx<{ id: string }[]>`
        insert into product_variant (tenant_id, product_id, title, price, inventory_quantity, track_inventory)
        values (${tenantId}, ${p[0]!.id}, 'Default', 500, 100, true) returning id`;
      return v[0]!.id;
    });

    // An order (creates the customer + a cod payment row).
    const placed = await placeOrder({
      tenantId,
      userId,
      customer: { phone: PHONE, name: "C360 Buyer" },
      shippingAddress: {
        recipient: "C360 Buyer",
        phone: PHONE,
        division: "Dhaka",
        district: "Dhaka",
        thana: "Mirpur",
        line: "Road 9",
      },
      items: [{ variantId, quantity: 2 }],
      paymentMethod: "cod",
      source: "manual",
      shippingTotal: 60,
    });
    orderId = placed.orderId;

    customerId = await withTenant(tenantId, userId, async (tx) => {
      const rows = await tx<{ id: string }[]>`select id from customer where phone = ${PHONE} limit 1`;
      return rows[0]!.id;
    });

    // Ledger: a sale then a partial payment → outstanding due of 560. A note on
    // the order. A return on the order. All inserted as the tenant (withTenant)
    // because order_note's RLS insert policy gates on author_id = current_user.
    await withTenant(tenantId, userId, async (tx) => {
      await tx`
        insert into customer_ledger (tenant_id, customer_id, type, amount, balance, note, created_at)
        values (${tenantId}, ${customerId}, 'sale', 1060, 1060, 'Order placed', now() - interval '2 hours')`;
      await tx`
        insert into customer_ledger (tenant_id, customer_id, type, amount, balance, note, created_at)
        values (${tenantId}, ${customerId}, 'payment', 500, 560, 'Partial cash', now() - interval '1 hour')`;
      await tx`
        insert into order_note (tenant_id, order_id, author_id, body)
        values (${tenantId}, ${orderId}, ${userId}, 'Called customer to confirm address')`;
      await tx`
        insert into return_request (tenant_id, order_id, status, reason, refund_amount)
        values (${tenantId}, ${orderId}, 'requested', 'damaged', 100)`;
    });
  });

  afterAll(cleanup);

  it("1. merges all five touchpoint types into one feed", async () => {
    const c = await getCustomer360(tenantId, userId, customerId);
    expect(c).not.toBeNull();
    const types = new Set(c!.timeline.map((e) => e.type));
    expect(types).toContain("order");
    expect(types).toContain("payment");
    expect(types).toContain("ledger");
    expect(types).toContain("note");
    expect(types).toContain("return");
  });

  it("2. timeline is sorted newest-first", async () => {
    const c = await getCustomer360(tenantId, userId, customerId);
    const ts = c!.timeline.map((e) => new Date(e.at).getTime());
    const sorted = [...ts].sort((a, b) => b - a);
    expect(ts).toEqual(sorted);
  });

  it("3. derives AOV, outstanding due, and an RFM segment", async () => {
    const c = await getCustomer360(tenantId, userId, customerId);
    // One order, grand total 1060 (2*500 + 60) → AOV = 1060.
    expect(c!.ordersCount).toBe(1);
    expect(c!.aov).toBe(1060);
    // Latest ledger balance = the বাকি still owed.
    expect(c!.ledgerBalance).toBe(560);
    // Recent single order → not "new" (it has an order) and a valid segment.
    expect(["champion", "loyal", "active", "at_risk", "lost"]).toContain(c!.rfmSegment);
    expect(c!.lastOrderAt).not.toBeNull();
  });

  it("4. RLS — another tenant's owner cannot read this customer", async () => {
    const otherEmail = `c360-other-${RUN}@store.test`;
    const other = await createAppUser({ email: otherEmail, fullName: "Other" });
    const otherTenant = await provisionTenant({
      userId: other.userId,
      storeName: "Other Vendor",
      slug: `c360-other-${RUN}`,
      businessType: "retail",
    });
    const leaked = await getCustomer360(otherTenant.tenantId, other.userId, customerId);
    expect(leaked).toBeNull();
    await asPlatformAdmin(async (tx) => {
      await tx`delete from tenant where id = ${otherTenant.tenantId}`;
      await tx`delete from app_user where email = ${otherEmail}`;
    });
  });
});
