// ============================================================================
// Analytics slice (S-ANALYTICS, Wave-3, blueprint 2.7) integration + unit suite.
// Runs against the SAME ephemeral embedded Postgres as the RLS gate
// (global-setup.ts), as the non-superuser app_runtime_login role (RLS FORCED).
// "@hybrid/db" + "@/" are aliased in vitest.config.ts so the apps/web analytics
// modules resolve here.
//
// Proves:
//   1. placeOrder mints a UUID-v4 analyticsEventId AND persists it to
//      payment.payload.analytics.eventId (the shared dedup key, audit trail).
//   2. firePurchaseAnalytics writes an internal order.placed row to the
//      tenant-scoped analytics_event table (RLS) and, with GA4/CAPI flags off,
//      makes NO external call (returns cleanly).
//   3. getAnalyticsConfig opens the sealed secrets; getPublicAnalyticsIds returns
//      ONLY the plaintext public IDs (never the secrets).
//   4. clientIdFromGaCookie parses a _ga cookie; the flag-gated GA4/CAPI senders
//      no-op (return false) when their env flag is off.
//
// GA4_ENABLED / CAPI_ENABLED are unset here → all external fires are no-ops; no
// network is touched.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin, withTenant, sealCredentials } from "../src/index";
import type { Tx } from "../src/index";
import { placeOrder } from "../../../apps/web/lib/commerce/placeOrder";
import {
  getAnalyticsConfig,
  getPublicAnalyticsIds,
} from "../../../apps/web/lib/analytics/config";
import { firePurchaseAnalytics } from "../../../apps/web/lib/analytics/notify";
import { clientIdFromGaCookie, sendGa4Purchase } from "../../../apps/web/lib/analytics/ga4";
import { sendMetaPurchase } from "../../../apps/web/lib/analytics/meta-capi";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a"; // slug 'store-a' (seed)
const PROD = "e0000091-0000-0000-0000-0000000000a1";
const VAR = "e0000092-0000-0000-0000-0000000000a2";
const PHONE = "01799000777";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ADDR = {
  recipient: "Karim",
  phone: PHONE,
  division: "Dhaka",
  district: "Dhaka",
  thana: "Mirpur",
  line: "House 9, Road 3",
};

async function cleanup(tx: Tx): Promise<void> {
  await tx`delete from analytics_event where tenant_id = ${TENANT_A} and type = 'order.placed'`;
  await tx`delete from payment where tenant_id = ${TENANT_A} and order_id in (select id from orders where customer_phone = ${PHONE})`;
  await tx`delete from order_item where tenant_id = ${TENANT_A} and order_id in (select id from orders where customer_phone = ${PHONE})`;
  await tx`delete from orders where tenant_id = ${TENANT_A} and customer_phone = ${PHONE}`;
  await tx`delete from order_counter where tenant_id = ${TENANT_A}`;
  await tx`delete from customer_address where tenant_id = ${TENANT_A} and customer_id in (select id from customer where phone = ${PHONE})`;
  await tx`delete from customer where tenant_id = ${TENANT_A} and phone = ${PHONE}`;
  await tx`delete from usage_counter where tenant_id = ${TENANT_A}`;
  await tx`delete from product_variant where id = ${VAR}`;
  await tx`delete from product where id = ${PROD}`;
}

beforeAll(async () => {
  if (!process.env.APP_ENCRYPTION_KEY) {
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  }
  // External fires must never touch the network in this suite.
  delete process.env.GA4_ENABLED;
  delete process.env.CAPI_ENABLED;

  await asPlatformAdmin(async (tx) => {
    await cleanup(tx);
    await tx`
      insert into product (id, tenant_id, title, slug, status)
      values (${PROD}, ${TENANT_A}, 'Analytics Test', 'analytics-test', 'active')
    `;
    await tx`
      insert into product_variant
        (id, tenant_id, product_id, title, sku, price, inventory_quantity, track_inventory)
      values (${VAR}, ${TENANT_A}, ${PROD}, 'Default', 'SKU-AN', 300.00, 50, true)
    `;
  });
});

afterAll(async () => {
  await asPlatformAdmin(cleanup);
});

describe("analytics — purchase dedup key", () => {
  it("1. placeOrder mints a UUID-v4 analyticsEventId and stores it in payment.payload", async () => {
    const result = await placeOrder({
      tenantId: TENANT_A,
      userId: null,
      customer: { phone: PHONE, name: "Karim" },
      shippingAddress: ADDR,
      items: [{ variantId: VAR, quantity: 2 }],
      paymentMethod: "cod",
      source: "storefront",
    });

    expect(result.analyticsEventId).toMatch(UUID_V4);

    const payload = await withTenant(TENANT_A, null, async (tx) => {
      const rows = await tx<{ payload: { analytics?: { eventId?: string } } | null }[]>`
        select payload from payment where id = ${result.paymentId} limit 1
      `;
      return rows[0]?.payload ?? null;
    });
    expect(payload?.analytics?.eventId).toBe(result.analyticsEventId);
  });

  it("2. firePurchaseAnalytics writes order.placed to analytics_event and makes no external call (flags off)", async () => {
    const order = await withTenant(TENANT_A, null, async (tx) => {
      const rows = await tx<{ id: string; customer_id: string | null }[]>`
        select id, customer_id from orders where customer_phone = ${PHONE} order by created_at desc limit 1
      `;
      return rows[0]!;
    });

    await firePurchaseAnalytics({
      tenantId: TENANT_A,
      orderId: order.id,
      customerId: order.customer_id,
      payload: {
        eventId: "11111111-1111-4111-8111-111111111111",
        orderNumber: 1234,
        value: 600,
        currency: "BDT",
        items: [{ id: PROD, name: "Analytics Test", price: 300, quantity: 2 }],
      },
      gaCookie: null,
    });

    const events = await withTenant(TENANT_A, null, (tx) =>
      tx<{ type: string; payload: { eventId?: string; value?: number } }[]>`
        select type, payload from analytics_event
         where tenant_id = ${TENANT_A} and type = 'order.placed'
      `,
    );
    expect(events.length).toBeGreaterThanOrEqual(1);
    const ev = events.find((e) => e.payload.eventId === "11111111-1111-4111-8111-111111111111");
    expect(ev).toBeDefined();
    expect(ev!.payload.value).toBe(600);
  });
});

describe("analytics — tenant config (sealed secrets)", () => {
  it("3. getAnalyticsConfig opens secrets; getPublicAnalyticsIds returns ONLY public IDs", async () => {
    const sealed = sealCredentials({ ga4ApiSecret: "ga4-secret-xyz", fbAccessToken: "fb-token-abc" });
    await asPlatformAdmin(async (tx) => {
      await tx`
        update tenant set settings = jsonb_set(
          coalesce(settings, '{}'::jsonb),
          '{analytics}',
          ${tx.json({
            enabled: true,
            ga4MeasurementId: "G-TEST123",
            fbPixelId: "PIXEL-999",
            fbTestEventCode: "TEST789",
            credentials: sealed,
          } as never)},
          true
        ) where id = ${TENANT_A}
      `;
    });

    const config = await getAnalyticsConfig(TENANT_A, null);
    expect(config.enabled).toBe(true);
    expect(config.ga4MeasurementId).toBe("G-TEST123");
    expect(config.fbPixelId).toBe("PIXEL-999");
    expect(config.ga4ApiSecret).toBe("ga4-secret-xyz");
    expect(config.fbAccessToken).toBe("fb-token-abc");

    const publicIds = await getPublicAnalyticsIds(TENANT_A, null);
    expect(publicIds.ga4MeasurementId).toBe("G-TEST123");
    expect(publicIds.fbPixelId).toBe("PIXEL-999");
    // Public accessor must NOT carry the secrets.
    expect((publicIds as unknown as Record<string, unknown>).ga4ApiSecret).toBeUndefined();
    expect((publicIds as unknown as Record<string, unknown>).fbAccessToken).toBeUndefined();

    // Restore.
    await asPlatformAdmin(
      (tx) => tx`update tenant set settings = settings - 'analytics' where id = ${TENANT_A}`,
    );
  });
});

describe("analytics — _ga cookie + flag gating", () => {
  it("4a. clientIdFromGaCookie parses the GA4 client_id from a _ga cookie", () => {
    expect(clientIdFromGaCookie("GA1.1.1234567890.1700000000")).toBe("1234567890.1700000000");
    expect(clientIdFromGaCookie(null)).toBeNull();
    expect(clientIdFromGaCookie("garbage")).toBeNull();
  });

  it("4b. GA4/CAPI senders no-op (return false) when their flag is off", async () => {
    const payload = {
      eventId: "22222222-2222-4222-8222-222222222222",
      orderNumber: 1,
      value: 100,
      currency: "BDT" as const,
      items: [{ id: PROD, name: "x", price: 100, quantity: 1 }],
    };
    expect(
      await sendGa4Purchase({ measurementId: "G-X", apiSecret: "s" }, payload, null),
    ).toBe(false);
    expect(
      await sendMetaPurchase({ pixelId: "P", accessToken: "t" }, payload),
    ).toBe(false);
  });
});
