// ============================================================================
// bKash callback amount-verification suite (HARDEN FIX 1 + FIX 3).
//
// Runs against the SAME ephemeral embedded Postgres as the RLS gate
// (global-setup.ts), as the non-superuser app_runtime_login role (RLS FORCED).
// Imports the callback core straight from apps/web/lib/** — "@hybrid/db" /
// "@hybrid/payments" / "next/cache" are aliased in vitest.config.ts.
//
// Proves:
//   1. success + correct amount      -> order paid, payment success.
//   2. success + underpaid amount    -> order NOT paid (stays unpaid), payment
//      failed with the discrepancy captured on the payload. Replay guard intact.
//   3. provider_ref is unique per (provider, provider_ref): the DB rejects a
//      duplicate bKash paymentID (FIX 3's primary defense — the index). The
//      callback lookup's >1-match guard is exercised by temporarily dropping the
//      index, inserting a duplicate, and asserting the lookup throws rather than
//      silently paying the wrong order (defense-in-depth).
// ============================================================================
import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { adminSql, asPlatformAdmin, withTenant } from "../src/index";
import type { Tx } from "../src/index";
import type {
  PaymentProvider,
  ProviderCreds,
  ExecutePaymentResult,
  QueryPaymentResult,
  CreatePaymentResult,
} from "../../payments/src/index";
import { processBkashCallback } from "../../../apps/web/lib/payments/callback";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a"; // slug 'store-a' (seed)
const PHONE = "01711333003";
const ORDER_TOTAL = 750;

// A bKash stub provider whose execute/query reports a fixed state + amount.
function makeStubBkash(
  paymentId: string,
  amount: string | undefined,
): { provider: PaymentProvider; creds: ProviderCreds } {
  const creds: ProviderCreds = {
    mode: "sandbox",
    username: "u",
    password: "p",
    appKey: "k",
    appSecret: "s",
  };
  const provider: PaymentProvider = {
    provider: "bkash",
    async createPayment(): Promise<CreatePaymentResult> {
      return { state: "pending", paymentId, redirectUrl: "https://bkash/redirect", raw: {} };
    },
    async executePayment(): Promise<ExecutePaymentResult> {
      return { state: "success", trxId: "TRX-AMT-001", amount, raw: { statusCode: "0000" } };
    },
    async queryPayment(): Promise<QueryPaymentResult> {
      return { state: "success", trxId: "TRX-AMT-001", amount, raw: { statusCode: "0000" } };
    },
  };
  return { provider, creds };
}

async function cleanup(tx: Tx): Promise<void> {
  await tx`delete from webhook_event where tenant_id = ${TENANT_A} and provider = 'bkash'`;
  await tx`delete from payment where tenant_id = ${TENANT_A} and order_id in (select id from orders where customer_phone = ${PHONE})`;
  await tx`delete from orders where tenant_id = ${TENANT_A} and customer_phone = ${PHONE}`;
  await tx`delete from order_counter where tenant_id = ${TENANT_A}`;
}

// Seed a single pending bKash order whose payment.provider_ref = the gateway
// paymentID. Returns the order id (for duplicate-payment insertion in FIX 3).
async function seedOrder(paymentId: string): Promise<string> {
  return withTenant(TENANT_A, null, async (tx) => {
    const order = await tx<{ id: string }[]>`
      insert into orders (
        tenant_id, customer_name, customer_phone, shipping_address,
        subtotal, grand_total, cod_amount, currency,
        payment_status, fulfillment_status, source
      ) values (
        ${TENANT_A}, 'Amount Buyer', ${PHONE}, ${tx.json({ division: "Dhaka" })},
        ${ORDER_TOTAL}, ${ORDER_TOTAL}, 0, 'BDT', 'unpaid', 'pending', 'storefront'
      ) returning id`;
    await tx`
      insert into payment (tenant_id, order_id, provider, status, amount, provider_ref)
      values (${TENANT_A}, ${order[0]!.id}, 'bkash', 'pending', ${ORDER_TOTAL}, ${paymentId})`;
    return order[0]!.id;
  });
}

async function readState(): Promise<{ orderPayment: string; paymentStatus: string }> {
  return withTenant(TENANT_A, null, async (tx) => {
    const order = await tx<{ payment_status: string }[]>`
      select payment_status from orders where customer_phone = ${PHONE}`;
    const payment = await tx<{ status: string }[]>`
      select p.status from payment p join orders o on o.id = p.order_id
       where o.customer_phone = ${PHONE} and p.provider = 'bkash'`;
    return { orderPayment: order[0]!.payment_status, paymentStatus: payment[0]!.status };
  });
}

describe("bKash callback — amount verification (FIX 1)", () => {
  const PAY_OK = "bkash-pay-AMT-OK";
  const PAY_UNDER = "bkash-pay-AMT-UNDER";

  beforeEach(async () => {
    await asPlatformAdmin(cleanup);
  });
  afterAll(async () => {
    await asPlatformAdmin(cleanup);
  });

  it("success + correct amount -> order paid", async () => {
    await seedOrder(PAY_OK);
    const stub = makeStubBkash(PAY_OK, "750.00"); // matches ORDER_TOTAL exactly
    const result = await processBkashCallback({
      paymentId: PAY_OK,
      status: "success",
      getProvider: async () => stub,
    });

    expect(result.outcome).toBe("paid");
    const state = await readState();
    expect(state.orderPayment).toBe("paid");
    expect(state.paymentStatus).toBe("success");
  });

  it("success + UNDERPAID amount -> order NOT paid (failed, discrepancy captured)", async () => {
    await seedOrder(PAY_UNDER);
    const stub = makeStubBkash(PAY_UNDER, "1.00"); // gateway charged less than total
    const result = await processBkashCallback({
      paymentId: PAY_UNDER,
      status: "success",
      getProvider: async () => stub,
    });

    // The discrepancy must NOT mark the order paid.
    expect(result.outcome).toBe("failed");
    const state = await readState();
    expect(state.orderPayment).toBe("unpaid"); // order_payment_status has no 'failed'
    expect(state.paymentStatus).toBe("failed");

    // The discrepancy is recorded on the payment payload for the seller.
    const payload = await withTenant(TENANT_A, null, async (tx) => {
      const rows = await tx<{ payload: { amountMismatch?: boolean; chargedAmount?: string } }[]>`
        select p.payload from payment p join orders o on o.id = p.order_id
         where o.customer_phone = ${PHONE} and p.provider = 'bkash'`;
      return rows[0]!.payload;
    });
    expect(payload.amountMismatch).toBe(true);

    // Replay guard still holds: a second callback is a no-op (webhook_event won
    // once). It does NOT flip the order to paid.
    const replay = await processBkashCallback({
      paymentId: PAY_UNDER,
      status: "success",
      getProvider: async () => stub,
    });
    expect(replay.outcome).toBe("replayed");
    const after = await readState();
    expect(after.orderPayment).toBe("unpaid");
  });

  it("missing gateway amount -> NOT paid (cannot verify)", async () => {
    await seedOrder(PAY_OK);
    const stub = makeStubBkash(PAY_OK, undefined); // gateway reported no amount
    const result = await processBkashCallback({
      paymentId: PAY_OK,
      status: "success",
      getProvider: async () => stub,
    });
    expect(result.outcome).toBe("failed");
    expect((await readState()).orderPayment).toBe("unpaid");
  });
});

describe("payment.provider_ref uniqueness + ambiguity guard (FIX 3)", () => {
  const PAY_DUP = "bkash-pay-DUP-001";

  beforeEach(async () => {
    await asPlatformAdmin(cleanup);
  });
  afterAll(async () => {
    await asPlatformAdmin(cleanup);
  });

  it("the DB rejects a duplicate bKash provider_ref (payment_provider_ref_uniq)", async () => {
    const orderId = await seedOrder(PAY_DUP);
    // A second bKash payment with the SAME provider_ref violates the unique index.
    await expect(
      withTenant(TENANT_A, null, async (tx) => {
        await tx`
          insert into payment (tenant_id, order_id, provider, status, amount, provider_ref)
          values (${TENANT_A}, ${orderId}, 'bkash', 'pending', ${ORDER_TOTAL}, ${PAY_DUP})`;
      }),
    ).rejects.toThrow();
  });

  it("if a duplicate ever slips in, the lookup throws rather than paying the wrong order", async () => {
    const orderId = await seedOrder(PAY_DUP);
    // Simulate a pre-index double-write: DDL + the bypassing insert use adminSql
    // (the superuser/DIRECT_URL connection — app_runtime_login can't do DDL),
    // proving the callback's >1-match guard is defense-in-depth.
    await adminSql`drop index if exists payment_provider_ref_uniq`;
    await adminSql`
      insert into payment (tenant_id, order_id, provider, status, amount, provider_ref)
      values (${TENANT_A}, ${orderId}, 'bkash', 'pending', ${ORDER_TOTAL}, ${PAY_DUP})`;

    const stub = makeStubBkash(PAY_DUP, "750.00");
    try {
      await expect(
        processBkashCallback({
          paymentId: PAY_DUP,
          status: "success",
          getProvider: async () => stub,
        }),
      ).rejects.toThrow(/ambiguous/);
      // The order was never touched.
      expect((await readState()).orderPayment).toBe("unpaid");
    } finally {
      // Restore the index for the rest of the suite (DB cluster is shared).
      // Clear the duplicate rows first so the unique index can be recreated.
      await adminSql`delete from payment where provider_ref = ${PAY_DUP}`;
      await adminSql`
        create unique index if not exists payment_provider_ref_uniq
          on payment(provider, provider_ref) where provider_ref is not null`;
    }
  });
});
