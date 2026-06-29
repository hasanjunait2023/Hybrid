// ============================================================================
// CRM lifecycle automation (Phase R1.4). Proves the journey runner: it evaluates
// each trigger (review_request / win_back / repeat_buyer) against the tenant's
// orders/customers, "sends" via the gated SMS adapter (log-only in test), and
// records an idempotent run per recipient — so a second pass sends nothing new.
// Tenant isolation verified by a second tenant whose run sends zero.
// Isolated on a freshly provisioned tenant.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin, withTenant } from "../src/index";

process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";

import { provisionTenant, createAppUser } from "../../../apps/web/lib/auth/provision";
import { placeOrder } from "@/lib/commerce/placeOrder";
import { createJourney, listJourneys } from "@/lib/admin/journeys";
import { runJourneysForTenant } from "@/lib/crm/runJourneys";

const RUN = Date.now().toString(36);
const SLUG = `jrn-${RUN}`;
const EMAIL = `jrn-${RUN}@store.test`;
const PHONE = "01977000888";

let tenantId = "";
let userId = "";
let orderId = "";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from crm_journey_run where tenant_id = ${tenantId}`;
    await tx`delete from crm_journey where tenant_id = ${tenantId}`;
    await tx`delete from payment where tenant_id = ${tenantId}`;
    await tx`delete from order_item where tenant_id = ${tenantId}`;
    await tx`delete from orders where tenant_id = ${tenantId}`;
    await tx`delete from order_counter where tenant_id = ${tenantId}`;
    await tx`delete from customer where tenant_id = ${tenantId}`;
    await tx`delete from tenant where slug = ${SLUG}`;
    await tx`delete from app_user where email = ${EMAIL}`;
  });
}

function reportFor(result: { reports: { trigger: string; sent: number }[] }, trigger: string): number {
  return result.reports.filter((r) => r.trigger === trigger).reduce((n, r) => n + r.sent, 0);
}

describe("CRM lifecycle automation", () => {
  beforeAll(async () => {
    userId = (await createAppUser({ email: EMAIL, fullName: "Journey Vendor" })).userId;
    tenantId = (await provisionTenant({ userId, storeName: "Journey Vendor", slug: SLUG, businessType: "retail" })).tenantId;

    const variantId = await asPlatformAdmin(async (tx) => {
      const p = await tx<{ id: string }[]>`
        insert into product (tenant_id, title, slug, status)
        values (${tenantId}, 'Journey Widget', 'journey-widget', 'active') returning id`;
      const v = await tx<{ id: string }[]>`
        insert into product_variant (tenant_id, product_id, title, price, inventory_quantity, track_inventory)
        values (${tenantId}, ${p[0]!.id}, 'Default', 500, 100, true) returning id`;
      return v[0]!.id;
    });

    const placed = await placeOrder({
      tenantId,
      userId,
      customer: { phone: PHONE, name: "Journey Buyer" },
      shippingAddress: { recipient: "Journey Buyer", phone: PHONE, division: "Dhaka", district: "Dhaka", thana: "Mirpur", line: "Rd 9" },
      items: [{ variantId, quantity: 1 }],
      paymentMethod: "cod",
      source: "manual",
    });
    orderId = placed.orderId;

    // Mark it delivered (review_request keys off updated_at, which the
    // set_updated_at trigger pins to now() — so we test it with thresholdDays=0)
    // and backdate placed_at 60 days so the customer reads as lapsed for win_back
    // (placed_at is not touched by the trigger).
    await asPlatformAdmin(async (tx) => {
      await tx`update orders set fulfillment_status = 'delivered', placed_at = now() - interval '60 days' where id = ${orderId}`;
    });
  });

  afterAll(cleanup);

  it("1. review_request sends to a delivered order, then is idempotent", async () => {
    await createJourney(tenantId, userId, {
      name: "Ask for review",
      trigger: "review_request",
      message: "Hi {name}, how was your order?",
      thresholdDays: 0,
    });

    const first = await runJourneysForTenant(tenantId, userId);
    expect(reportFor(first, "review_request")).toBe(1);

    // The run is recorded against the order.
    const runs = await withTenant(tenantId, userId, (tx) =>
      tx<{ reference_id: string | null }[]>`select reference_id from crm_journey_run`,
    );
    expect(runs.some((r) => r.reference_id === orderId)).toBe(true);

    const second = await runJourneysForTenant(tenantId, userId);
    expect(reportFor(second, "review_request")).toBe(0);
  });

  it("2. win_back and repeat_buyer each send once to the lapsed repeat customer", async () => {
    await createJourney(tenantId, userId, {
      name: "Come back",
      trigger: "win_back",
      message: "We miss you {name}!",
      thresholdDays: 30,
    });
    await createJourney(tenantId, userId, {
      name: "Thanks",
      trigger: "repeat_buyer",
      message: "Thank you {name}!",
      minOrders: 1,
    });

    const r = await runJourneysForTenant(tenantId, userId);
    expect(reportFor(r, "win_back")).toBe(1);
    expect(reportFor(r, "repeat_buyer")).toBe(1);
    // review_request already fired in test 1 → no new send.
    expect(reportFor(r, "review_request")).toBe(0);

    // Re-running sends nothing new across all three.
    const again = await runJourneysForTenant(tenantId, userId);
    expect(again.sent).toBe(0);
  });

  it("3. RLS — another tenant has no journeys and its run sends zero", async () => {
    const otherEmail = `jrn-other-${RUN}@store.test`;
    const other = await createAppUser({ email: otherEmail, fullName: "Other" });
    const otherTenant = await provisionTenant({
      userId: other.userId,
      storeName: "Other Vendor",
      slug: `jrn-other-${RUN}`,
      businessType: "retail",
    });
    expect(await listJourneys(otherTenant.tenantId, other.userId)).toHaveLength(0);
    const r = await runJourneysForTenant(otherTenant.tenantId, other.userId);
    expect(r.journeys).toBe(0);
    expect(r.sent).toBe(0);
    await asPlatformAdmin(async (tx) => {
      await tx`delete from tenant where id = ${otherTenant.tenantId}`;
      await tx`delete from app_user where email = ${otherEmail}`;
    });
  });
});
