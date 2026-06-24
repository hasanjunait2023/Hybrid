// bKash callback processing core (blueprint S-CHECKOUT idempotency; research §1).
//
// The browser is redirected back to /api/bkash/callback?paymentID=...&status=...
// after the tokenized popup. That GET is only a HINT — we ALWAYS execute (and,
// if execute is lost, query) server-side. This module owns the idempotent state
// transition so the route handler stays thin and the integration test can drive
// it directly without HTTP.
//
// Idempotency invariants honored (blueprint "Sacred invariants"):
//   * webhook_event unique(provider, external_id=paymentID) ON CONFLICT DO
//     NOTHING — we process ONLY when our insert won the race. A replayed
//     callback (same paymentID) inserts 0 rows and short-circuits as "replayed".
//   * payment_txn_uniq blocks a duplicate trxID at the DB layer.
//   * Amounts/prices are never trusted from the callback — the order was already
//     server-priced at placeOrder time. The gateway's executed/queried amount is
//     verified (paisa-exact) against the order total before we mark paid; a
//     success that doesn't reconcile is recorded as a discrepancy, never paid.
//
// All DB writes run inside withTenant for the resolved tenant (RLS scoped). The
// tenant is resolved from the payment row (we look it up as platform admin since
// the callback host carries no tenant context).
import { asPlatformAdmin, withTenant } from "@hybrid/db";
import type { Tx } from "@hybrid/db";
import type { PaymentProvider, ProviderCreds, PaymentState } from "@hybrid/payments";
import { toJsonRecord } from "./json";

const PROVIDER = "bkash";

// Decimal-safe money equality. BDT is priced to 2dp; compare in minor units
// (paisa) via rounding so float drift (e.g. 0.1 + 0.2) can never make a mismatch
// look equal or vice-versa. A missing/unparseable charged amount is NOT equal —
// we refuse to mark paid when the gateway didn't report a verifiable amount.
function toMinorUnits(value: number): number {
  return Math.round(value * 100);
}

function amountsEqual(charged: string | undefined, expected: number): boolean {
  if (charged == null || charged.trim() === "") return false;
  const parsed = Number(charged);
  if (!Number.isFinite(parsed)) return false;
  return toMinorUnits(parsed) === toMinorUnits(expected);
}

export type CallbackOutcome = "paid" | "failed" | "cancelled" | "replayed" | "unknown";

export interface ProcessBkashCallbackInput {
  paymentId: string;
  /** Browser-supplied status hint (success|failure|cancel). Advisory only. */
  status?: string | null;
  /** Resolves the enabled provider + creds for a tenant (decrypts secrets). */
  getProvider: (tenantId: string) => Promise<{ provider: PaymentProvider; creds: ProviderCreds } | null>;
  /** Fired post-commit on success (SMS). Non-blocking; caught by the caller. */
  onPaid?: (ctx: PaidContext) => Promise<void>;
}

export interface PaidContext {
  tenantId: string;
  orderId: string;
  orderNumber: number;
  total: number;
  customerName: string;
  customerPhone: string;
}

export interface ProcessBkashCallbackResult {
  outcome: CallbackOutcome;
  /** The tenant slug for the success/failure redirect, when resolvable. */
  tenantSlug: string | null;
  orderNumber: number | null;
}

interface PaymentLookup {
  paymentId: string;
  tenantId: string;
  tenantSlug: string;
  orderId: string;
  orderNumber: number;
  total: number;
  customerName: string;
  customerPhone: string;
  paymentStatus: string;
  paymentTransactionId: string | null;
}

// Resolve the payment + its tenant from the bKash paymentID. The paymentID was
// stored as the gateway create-response's id; we matched it back via provider_ref
// at create time (see checkout/actions.ts). Falls back to nothing when unknown.
async function lookupPaymentByExternalId(
  paymentId: string,
): Promise<PaymentLookup | null> {
  const rows = await asPlatformAdmin((tx) =>
    tx<
      {
        payment_id: string;
        tenant_id: string;
        slug: string;
        order_id: string;
        order_number: string;
        grand_total: string;
        customer_name: string | null;
        customer_phone: string | null;
        payment_status: string;
        transaction_id: string | null;
      }[]
    >`
      select
        p.id            as payment_id,
        p.tenant_id     as tenant_id,
        t.slug          as slug,
        o.id            as order_id,
        o.order_number  as order_number,
        o.grand_total   as grand_total,
        o.customer_name as customer_name,
        o.customer_phone as customer_phone,
        p.status        as payment_status,
        p.transaction_id as transaction_id
      from payment p
      join orders o on o.id = p.order_id
      join tenant t on t.id = p.tenant_id
      where p.provider = 'bkash' and p.provider_ref = ${paymentId}
      limit 2
    `,
  );

  // provider_ref is unique per (provider, provider_ref) — more than one match is
  // a data-integrity violation we must NOT paper over by silently picking the
  // first (it could pay the wrong order). Fail loudly so the callback aborts.
  if (rows.length > 1) {
    throw new Error(`ambiguous bKash paymentID ${paymentId}: ${rows.length} payment rows`);
  }

  const row = rows[0];
  if (!row) return null;
  return {
    paymentId: row.payment_id,
    tenantId: row.tenant_id,
    tenantSlug: row.slug,
    orderId: row.order_id,
    orderNumber: Number(row.order_number),
    total: Number(row.grand_total),
    customerName: row.customer_name ?? "",
    customerPhone: row.customer_phone ?? "",
    paymentStatus: row.payment_status,
    paymentTransactionId: row.transaction_id,
  };
}

// Claim the webhook_event row. Returns true iff THIS call inserted it (won the
// race); false if it already existed (a replay). Runs in the tenant's RLS scope.
async function claimWebhookEvent(
  tx: Tx,
  tenantId: string,
  paymentId: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const inserted = await tx<{ id: string }[]>`
    insert into webhook_event (tenant_id, provider, event_type, external_id, payload)
    values (${tenantId}, ${PROVIDER}, 'payment.callback', ${paymentId}, ${tx.json(toJsonRecord(payload as Record<string, unknown>))})
    on conflict (provider, external_id) do nothing
    returning id
  `;
  return inserted.length === 1;
}

// Mark the claimed webhook_event processed within the same txn (atomic with the
// status flip — either both commit or neither does).
async function markProcessed(tx: Tx, paymentId: string): Promise<void> {
  await tx`
    update webhook_event
       set processed = true, processed_at = now()
     where provider = ${PROVIDER} and external_id = ${paymentId}
  `;
}

// The full idempotent transition. Resolves the payment/tenant, claims the
// webhook_event (replay guard), executes (with a query safety net), and flips
// payment + order statuses — all inside one withTenant transaction.
export async function processBkashCallback(
  input: ProcessBkashCallbackInput,
): Promise<ProcessBkashCallbackResult> {
  const lookup = await lookupPaymentByExternalId(input.paymentId);
  if (!lookup) {
    return { outcome: "unknown", tenantSlug: null, orderNumber: null };
  }

  const enabled = await input.getProvider(lookup.tenantId);
  if (!enabled) {
    // bKash disabled/misconfigured after create — cannot verify. Leave pending.
    return { outcome: "unknown", tenantSlug: lookup.tenantSlug, orderNumber: lookup.orderNumber };
  }

  // Execute the payment (server-side, authoritative). If execute didn't yield a
  // terminal success — the callback/execute can be lost — fall back to query.
  let state: PaymentState;
  let trxId: string | undefined;
  let chargedAmount: string | undefined;
  let raw: unknown;
  // Flips true when the gateway reported success but the charged amount does not
  // reconcile with the order total — the order is failed (discrepancy), not paid.
  let amountMismatch = false;

  const executed = await enabled.provider.executePayment(
    { paymentId: input.paymentId },
    enabled.creds,
  );
  state = executed.state;
  trxId = executed.trxId;
  chargedAmount = executed.amount;
  raw = executed.raw;

  if (state !== "success") {
    const queried = await enabled.provider.queryPayment(
      { paymentId: input.paymentId },
      enabled.creds,
    );
    // Query is the safety net: trust a success it reports even if execute didn't.
    if (queried.state === "success") {
      state = queried.state;
      trxId = queried.trxId ?? trxId;
      chargedAmount = queried.amount ?? chargedAmount;
      raw = queried.raw;
    }
  }

  // Amount verification (research §1 "Amounts are never trusted from the
  // callback"): the gateway-reported charged amount MUST equal the server-priced
  // order total to the paisa, or we refuse to mark the order paid. A success
  // that doesn't reconcile is treated as a discrepancy (failed), never paid.
  if (state === "success" && !amountsEqual(chargedAmount, lookup.total)) {
    // Server-side log only — no secrets, no full gateway body.
    console.error(
      `[bkash-callback] amount mismatch for payment ${lookup.paymentId}: ` +
        `charged=${chargedAmount ?? "<none>"} expected=${lookup.total}`,
    );
    state = "failed";
    amountMismatch = true;
  }

  // Run the idempotent transition and return its outcome + paid-context from the
  // closure (returning beats mutating an outer `let` — keeps TS narrowing sound).
  const txResult = await withTenant(lookup.tenantId, null, async (tx): Promise<{
    outcome: CallbackOutcome;
    paidContext: PaidContext | null;
  }> => {
    // Replay guard: process ONLY if our webhook_event insert won.
    const won = await claimWebhookEvent(
      tx,
      lookup.tenantId,
      input.paymentId,
      { paymentId: input.paymentId, status: input.status ?? null, state, trxId, raw },
    );
    if (!won) {
      return { outcome: "replayed", paidContext: null };
    }

    if (state === "success") {
      // payment.status='success' + transaction_id=trxID; orders.payment_status='paid'.
      // payment_txn_uniq guards against a duplicate trxID slipping in.
      // MERGE into the existing payload (||) — placeOrder/createPayment seeded
      // payload.analytics.eventId + the create response; clobbering here would
      // drop the analytics dedup key the success page reads. Preserve both ways.
      await tx`
        update payment
           set status = 'success',
               transaction_id = ${trxId ?? null},
               payload = coalesce(payload, '{}'::jsonb) || ${tx.json(toJsonRecord({ paymentId: input.paymentId, trxId, raw }))},
               paid_at = now(),
               updated_at = now()
         where id = ${lookup.paymentId}
      `;
      await tx`
        update orders
           set payment_status = 'paid', updated_at = now()
         where id = ${lookup.orderId}
      `;
      await markProcessed(tx, input.paymentId);
      return {
        outcome: "paid",
        paidContext: {
          tenantId: lookup.tenantId,
          orderId: lookup.orderId,
          orderNumber: lookup.orderNumber,
          total: lookup.total,
          customerName: lookup.customerName,
          customerPhone: lookup.customerPhone,
        },
      };
    }

    // Fail/cancel: mark the payment, but the ORDER STANDS (blueprint: order
    // stands, payment failed). No inventory restore — the decrement already
    // reserved stock at placeOrder; an unpaid bKash order is the seller's to
    // chase or cancel manually.
    const failState = state === "cancelled" ? "cancelled" : "failed";
    // MERGE into the existing payload (||) — keep the analytics dedup key + the
    // create response placeOrder/createPayment seeded; only add the failure detail.
    await tx`
      update payment
         set status = ${failState},
             payload = coalesce(payload, '{}'::jsonb) || ${tx.json(
               toJsonRecord({
                 paymentId: input.paymentId,
                 state,
                 amountMismatch,
                 chargedAmount: chargedAmount ?? null,
                 expectedAmount: lookup.total,
                 raw,
               }),
             )},
             updated_at = now()
       where id = ${lookup.paymentId}
    `;
    // The order is NEVER marked paid here. order_payment_status has no 'failed'
    // value (enum: unpaid/partially_paid/paid/refunded/partially_refunded), so
    // the order stays 'unpaid' — which is the correct money state: the cash did
    // not reconcile, so nothing is collectable. The discrepancy is captured on
    // the payment row's status + payload for the seller to chase.
    await markProcessed(tx, input.paymentId);
    return { outcome: failState === "cancelled" ? "cancelled" : "failed", paidContext: null };
  });

  const { outcome, paidContext } = txResult;

  if (outcome === "paid" && paidContext && input.onPaid) {
    // Post-commit, non-blocking. The caller's onPaid catches its own errors.
    await input.onPaid(paidContext);
  }

  return { outcome, tenantSlug: lookup.tenantSlug, orderNumber: lookup.orderNumber };
}
