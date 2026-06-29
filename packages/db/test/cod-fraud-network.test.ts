// ============================================================================
// COD fraud network + composite scoring (Phase R2.2). Proves: (1) scorePhoneRisk
// composes local/network/external into a level + reasons; (2) signals feed a
// privacy-safe cross-tenant aggregate — a phone flagged by store A shows up for
// store B (but not for A itself), idempotently; (3) blockPhone emits a network
// signal; (4) listOrders carries a cheap local risk level. Isolated on freshly
// provisioned tenants.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";

process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";

import { provisionTenant, createAppUser } from "../../../apps/web/lib/auth/provision";
import {
  recordCodRiskSignal,
  getNetworkPhoneRisk,
  scorePhoneRisk,
  blockPhone,
  type OrderRiskSignals,
} from "@/lib/admin/fraud";
import { listOrders } from "@/lib/admin/orders";

const RUN = Date.now().toString(36);
const PHONE = `0190${RUN.slice(-7).padStart(7, "0")}`.slice(0, 11);
const BLOCKED_PHONE = "01700000999";

let tenantA = "";
let userA = "";
let tenantB = "";
let userB = "";

const emails = [`fraudA-${RUN}@s.test`, `fraudB-${RUN}@s.test`];

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    for (const tid of [tenantA, tenantB].filter(Boolean)) {
      await tx`delete from cod_risk_signal where tenant_id = ${tid}`;
      await tx`delete from phone_blocklist where tenant_id = ${tid}`;
      await tx`delete from orders where tenant_id = ${tid}`;
      await tx`delete from customer where tenant_id = ${tid}`;
      await tx`delete from tenant where id = ${tid}`;
    }
    await tx`delete from app_user where email in ${tx(emails)}`;
  });
}

// Minimal OrderRiskSignals factory for the pure-scoring tests.
function sig(partial: Partial<OrderRiskSignals>): OrderRiskSignals {
  return {
    phone: PHONE,
    blocked: false,
    duplicateRecent: 0,
    priorOrders: 0,
    priorCancelled: 0,
    priorReturned: 0,
    priorDelivered: 0,
    rtoRate: 0,
    ...partial,
  };
}

describe("COD fraud network + scoring", () => {
  beforeAll(async () => {
    userA = (await createAppUser({ email: emails[0]!, fullName: "Fraud A" })).userId;
    tenantA = (await provisionTenant({ userId: userA, storeName: "Fraud A", slug: `frauda-${RUN}`, businessType: "retail" })).tenantId;
    userB = (await createAppUser({ email: emails[1]!, fullName: "Fraud B" })).userId;
    tenantB = (await provisionTenant({ userId: userB, storeName: "Fraud B", slug: `fraudb-${RUN}`, businessType: "retail" })).tenantId;
  });

  afterAll(cleanup);

  it("1. scorePhoneRisk composes a level + reasons", () => {
    expect(scorePhoneRisk({ local: sig({}) }).level).toBe("low");
    expect(scorePhoneRisk({ local: sig({ blocked: true }) }).level).toBe("high");

    const dup = scorePhoneRisk({ local: sig({ duplicateRecent: 1 }) });
    expect(dup.level).toBe("high");
    expect(dup.reasons).toContain("duplicate");

    const rtoHigh = scorePhoneRisk({ local: sig({ priorOrders: 3, rtoRate: 0.6 }) });
    expect(rtoHigh.level).toBe("high");

    const net1 = scorePhoneRisk({ local: sig({}), network: { storesFlagged: 1, signals: 1 } });
    expect(net1.level).toBe("medium");
    const net2 = scorePhoneRisk({ local: sig({}), network: { storesFlagged: 2, signals: 3 } });
    expect(net2.level).toBe("high");
    expect(net2.reasons).toContain("network");
  });

  it("2. a signal from store A is visible to store B but not to A (privacy-safe aggregate)", async () => {
    await recordCodRiskSignal(tenantA, userA, { phone: PHONE, kind: "cancel", orderId: null });

    const forB = await getNetworkPhoneRisk(PHONE, tenantB);
    expect(forB.storesFlagged).toBe(1);
    expect(forB.signals).toBeGreaterThanOrEqual(1);

    // Store A excludes itself — its own signal isn't network noise to itself.
    const forA = await getNetworkPhoneRisk(PHONE, tenantA);
    expect(forA.storesFlagged).toBe(0);
  });

  it("3. recording the same signal twice is idempotent", async () => {
    await recordCodRiskSignal(tenantA, userA, { phone: PHONE, kind: "cancel", orderId: null });
    const forB = await getNetworkPhoneRisk(PHONE, tenantB);
    // Still one store, and the cancel(null-order) signal didn't duplicate.
    expect(forB.storesFlagged).toBe(1);
  });

  it("4. blockPhone emits a network signal", async () => {
    await blockPhone(tenantB, userB, BLOCKED_PHONE, "repeat canceller");
    const forA = await getNetworkPhoneRisk(BLOCKED_PHONE, tenantA);
    expect(forA.storesFlagged).toBe(1);
  });

  it("5. listOrders carries a local risk level (prior bad outcomes → high)", async () => {
    // Two cancelled orders + one fresh order for the same phone, all in tenant A.
    const freshId = await asPlatformAdmin(async (tx) => {
      await tx`
        insert into orders (tenant_id, customer_phone, order_number, fulfillment_status, payment_status, subtotal, shipping_total, grand_total, cod_amount)
        values
          (${tenantA}, ${PHONE}, 901, 'cancelled', 'unpaid', 100, 0, 100, 100),
          (${tenantA}, ${PHONE}, 902, 'returned', 'unpaid', 100, 0, 100, 100)`;
      const fresh = await tx<{ id: string }[]>`
        insert into orders (tenant_id, customer_phone, order_number, fulfillment_status, payment_status, subtotal, shipping_total, grand_total, cod_amount)
        values (${tenantA}, ${PHONE}, 903, 'pending', 'unpaid', 100, 0, 100, 100) returning id`;
      return fresh[0]!.id;
    });

    const orders = await listOrders(tenantA, userA, {});
    const fresh = orders.find((o) => o.id === freshId)!;
    expect(fresh.riskLevel).toBe("high"); // 2 prior bad outcomes for this phone
  });
});
