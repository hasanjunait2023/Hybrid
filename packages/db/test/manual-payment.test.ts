// ============================================================================
// Manual payment / partial advance slice (tenant roadmap P1 #4). Embedded
// Postgres, app_runtime_login (RLS FORCED). Exercises recordManualPayment.
//
// Proves: a partial payment marks the order partially_paid and reduces COD-due
// by the amount; a follow-up payment that clears the balance marks it paid with
// COD-due 0; the running total is the SUM of successful payments.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import { placeOrder } from "../../../apps/web/lib/commerce/placeOrder";
import { getOrderDetail } from "../../../apps/web/lib/admin/orders";
import { recordManualPayment } from "../../../apps/web/lib/admin/payments";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const OWNER_A = "11111111-1111-1111-1111-111111111001";

const MP_PROD = "e0000012-0000-0000-0000-000000000e12";
const MP_VAR = "f0000012-0000-0000-0000-000000000f12";
const PHONE = "01977000012";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from payment where tenant_id = ${TENANT_A}`;
    await tx`delete from order_item where tenant_id = ${TENANT_A}`;
    await tx`delete from orders where tenant_id = ${TENANT_A}`;
    await tx`delete from customer where tenant_id = ${TENANT_A} and phone = ${PHONE}`;
    await tx`delete from product_variant where id = ${MP_VAR}`;
    await tx`delete from product where id = ${MP_PROD}`;
  });
}

describe("manual payment / partial advance slice", () => {
  let orderId = "";
  let grandTotal = 0;

  beforeAll(async () => {
    await cleanup();
    await asPlatformAdmin(async (tx) => {
      await tx`
        insert into product (id, tenant_id, title, slug, status) values
          (${MP_PROD}, ${TENANT_A}, 'Pay Test', 'pay-test', 'active')
      `;
      await tx`
        insert into product_variant (id, tenant_id, product_id, title, sku, price, inventory_quantity, track_inventory) values
          (${MP_VAR}, ${TENANT_A}, ${MP_PROD}, 'M', 'PAY-M', 1000.00, 50, true)
      `;
    });
    const placed = await placeOrder({
      tenantId: TENANT_A,
      userId: OWNER_A,
      customer: { phone: PHONE, name: "Pay Tester" },
      shippingAddress: {
        recipient: "Pay Tester", phone: PHONE, division: "Dhaka",
        district: "Dhaka", thana: "Mirpur", line: "House 1",
      },
      items: [{ variantId: MP_VAR, quantity: 1 }],
      paymentMethod: "cod",
      source: "manual",
    });
    orderId = placed.orderId;
    const d = await getOrderDetail(TENANT_A, OWNER_A, orderId);
    grandTotal = d!.grandTotal;
    expect(grandTotal).toBeGreaterThan(0);
  });

  afterAll(cleanup);

  it("1. partial advance → partially_paid, COD-due drops by the amount", async () => {
    const advance = 400;
    const res = await recordManualPayment(TENANT_A, OWNER_A, orderId, {
      provider: "bkash",
      amount: advance,
      transactionId: "TRX-ADV-1",
    });
    expect(res.paymentStatus).toBe("partially_paid");
    expect(res.totalPaid).toBe(advance);
    expect(res.codDue).toBe(grandTotal - advance);

    const d = await getOrderDetail(TENANT_A, OWNER_A, orderId);
    expect(d!.paymentStatus).toBe("partially_paid");
    expect(d!.codAmount).toBe(grandTotal - advance);
  });

  it("2. clearing the balance → paid, COD-due 0", async () => {
    const res = await recordManualPayment(TENANT_A, OWNER_A, orderId, {
      provider: "nagad",
      amount: grandTotal - 400,
      transactionId: "TRX-FULL-1",
    });
    expect(res.paymentStatus).toBe("paid");
    expect(res.totalPaid).toBe(grandTotal);
    expect(res.codDue).toBe(0);

    const d = await getOrderDetail(TENANT_A, OWNER_A, orderId);
    expect(d!.paymentStatus).toBe("paid");
    expect(d!.codAmount).toBe(0);
  });

  it("3. rejects a non-positive amount", async () => {
    await expect(
      recordManualPayment(TENANT_A, OWNER_A, orderId, { provider: "bkash", amount: 0 }),
    ).rejects.toThrow();
  });
});
