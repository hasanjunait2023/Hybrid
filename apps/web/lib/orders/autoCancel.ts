// O20 — Auto-cancel unpaid orders.
//
// Sweeper that runs from /api/internal/auto-cancel-unpaid on a cron. The
// cron is expected to be cheap — every call is one indexed range scan over
// orders with payment_status='unpaid' AND cancel_after_at <= now() (partial
// index `orders_auto_cancel_sweep_idx` from 30_auto_cancel.sql keeps it
// O(overdue) instead of O(all_unpaid)).
//
// What this sweep does:
//   1. Pick all overdue + unpaid orders (FOR UPDATE SKIP LOCKED so two
//      concurrent sweeps can never double-cancel the same row).
//   2. For each order: SELECT FOR UPDATE the row, validate state still
//      qualifies, update orders.status + cancel_reason + cancel_after_at,
//      restore inventory (via the shared restoreInventory helper), and
//      INSERT into auto_cancel_log. All in ONE withTenant txn per order.
//   3. Enqueue the customer SMS AFTER the txn commits (best-effort; never
//      rolls back the cancel).
//
// Concurrent-safety:
//   * The outer asPlatformAdmin scan uses FOR UPDATE SKIP LOCKED.
//   * The per-order withTenant txn re-reads the row FOR UPDATE, so a race
//     between cron + admin manual cancel still settles to "first commit
//     wins" (the second one sees a non-eligible row and skips).
//   * `auto_cancel_log.order_id` UNIQUE means even if both paths somehow
//     won the lock, the DB rejects the duplicate audit row.
//
// Failure-mode:
//   * One bad order never aborts the sweep. Each order is its own try/catch
//     and the run tallies errors + continues.
//   * The sweep is idempotent on re-run (a cancelled order will be skipped).
//
// Configurable threshold:
//   * The actual sweep candidate-set is filtered by `cancel_after_at` which
//     was stamped at order placement time using the SAME env var. So
//     changing AUTO_CANCEL_HOURS only affects NEW orders — already-placed
//     orders keep their original cancel_after_at. That is intentional:
//     moving the cut-off line arbitrarily affects merchants.

import { asPlatformAdmin, withTenant } from "@hybrid/db";
import type { Tx } from "@hybrid/db";
import { restoreInventory } from "@/lib/admin/orders";
import { enqueueAutoCancelSms } from "@/lib/sms/queue";

/** Default: 48h. Override with AUTO_CANCEL_HOURS env var. */
const DEFAULT_THRESHOLD_HOURS = 48;

/** Read with a tiny parser (lets "48" or "48.5" both work). */
export function autoCancelHoursFromEnv(): number {
  const raw = process.env.AUTO_CANCEL_HOURS;
  if (!raw) return DEFAULT_THRESHOLD_HOURS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_THRESHOLD_HOURS;
  return n;
}

export interface AutoCancelSweepInput {
  /** Caller-supplied "now" so tests are deterministic. */
  now: Date;
  /** Optional override for the threshold hours (used by tests). */
  thresholdHours?: number;
}

export interface AutoCancelSweepResult {
  /** Total overdue rows the scan picked up. */
  scanned: number;
  /** Orders whose status was flipped to 'cancelled' this run. */
  cancelled: number;
  /** Orders that were eligible at scan time but skipped because another
   *  sweep (or admin manual cancel) raced us and won. Idempotent. */
  skippedRace: number;
  /** Non-fatal errors encountered (logged, never thrown). */
  errors: number;
  /** Threshold in hours this run used. */
  thresholdHours: number;
}

interface OverdueOrderRow {
  id: string;
  tenant_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  cancel_after_at: Date;
  fulfillment_status: "pending" | "confirmed" | "packed" | "shipped" | "in_transit";
  payment_status: string;
}

export async function runAutoCancelSweep(
  input: AutoCancelSweepInput,
): Promise<AutoCancelSweepResult> {
  const thresholdHours = input.thresholdHours ?? autoCancelHoursFromEnv();
  const now = input.now;

  const result: AutoCancelSweepResult = {
    scanned: 0,
    cancelled: 0,
    skippedRace: 0,
    errors: 0,
    thresholdHours,
  };

  // (1) scan for overdue unpaid orders. The partial index keeps this cheap.
  // FOR UPDATE SKIP LOCKED so multi-instance cron deployments can run in
  // parallel; the row-locked ones get re-picked up by the loser on the
  // next sweep if their lock is released without a state change.
  let overdue: OverdueOrderRow[] = [];
  try {
    overdue = await asPlatformAdmin((tx) =>
      tx<OverdueOrderRow[]>`
        select
          o.id,
          o.tenant_id,
          o.order_number,
          o.customer_name,
          o.customer_phone,
          o.cancel_after_at,
          o.fulfillment_status,
          o.payment_status
        from orders o
        where o.payment_status = 'unpaid'
          and o.fulfillment_status in ('pending', 'confirmed')
          and o.cancel_after_at is not null
          and o.cancel_after_at <= ${now.toISOString()}::timestamptz
          and o.cancelled_at is null
        order by o.cancel_after_at asc
        limit 500
        for update skip locked
      `,
    );
  } catch (err) {
    console.warn("[auto-cancel-unpaid] scan failed:", err);
    result.errors += 1;
    return result;
  }

  result.scanned = overdue.length;
  console.warn(
    `[auto-cancel-unpaid] scanned ${result.scanned} overdue order(s) at threshold=${thresholdHours}h`,
  );

  // (2) process each row in its own withTenant txn. One bad row never
  // aborts the batch.
  for (const row of overdue) {
    try {
      const out = await cancelOneOrder(row.id, now, thresholdHours);
      if (out) {
        result.cancelled += 1;
        // Best-effort SMS. NON-blocking: a queue failure here must never
        // roll back the cancel. Errors are swallowed inside the queue.
        void enqueueAutoCancelSms({
          orderId: out.orderId,
          tenantId: out.tenantId,
        }).catch((err) =>
          console.warn(
            `[auto-cancel-unpaid] enqueue SMS failed for order ${out.orderId}:`,
            err,
          ),
        );
      } else {
        result.skippedRace += 1;
      }
    } catch (err) {
      result.errors += 1;
      console.warn(
        `[auto-cancel-unpaid] order ${row.id} (tenant ${row.tenant_id}) failed:`,
        err,
      );
    }
  }

  console.warn(
    `[auto-cancel-unpaid] done: cancelled=${result.cancelled} skipped=${result.skippedRace} errors=${result.errors}`,
  );

  return result;
}

/**
 * Cancel a single overdue order under withTenant RLS. Returns the orderId
 * if the cancel committed, or null if the row no longer qualified (race
 * with another sweep / manual cancel). The audit log is written inside
 * the same txn so either both the cancel + audit land or neither does.
 *
 * Inventory restore is done via the shared helper from lib/admin/orders —
 * it joins product_variant to order_item and re-credits stock for tracked
 * variants only.
 *
 * Cross-tenant note: the orchestrator collects overdue orders across ALL
 * tenants via asPlatformAdmin (necessary — a sweep must visit every
 * tenant). For the per-order work itself, we re-read the row to get the
 * tenant, then enter withTenant for the mutation + audit. This keeps RLS
 * firing on every read/write of the orders/order_item/product_variant/
 * auto_cancel_log tables.
 */
async function cancelOneOrder(
  orderId: string,
  now: Date,
  thresholdHours: number,
): Promise<{ orderId: string; tenantId: string } | null> {
  // (1) Resolve the tenant via the platform-admin scan path. The row's
  // tenant_id is the only signal we have at the start of the per-order
  // txn (we already saw it during the outer SELECT, but a race with
  // tenant migration could in theory have changed it; re-read here).
  const header = await asPlatformAdmin(async (tx) => {
    const rows = await tx<{ tenant_id: string }[]>`
      select tenant_id from orders where id = ${orderId} for update
    `;
    return rows[0] ?? null;
  });
  if (!header) return null;
  const tenantId = header.tenant_id;

  // (2) Enter the tenant-scoped txn for the mutate + audit work.
  return withTenant(tenantId, null, async (tx: Tx) => {
    // Re-lock the row FOR UPDATE inside the tenant txn.
    const rows = await tx<
      {
        id: string;
        tenant_id: string;
        order_number: string;
        cancel_after_at: Date | null;
        payment_status: string;
        fulfillment_status: string;
        cancelled_at: Date | null;
        placed_at: Date;
      }[]
    >`
      select
        id, tenant_id, order_number, cancel_after_at,
        payment_status, fulfillment_status, cancelled_at, placed_at
      from orders
      where id = ${orderId}
      for update
    `;
    const order = rows[0];
    if (!order) return null;

    // Re-check eligibility — a parallel sweep / admin cancel could have
    // moved the order out of the eligible window.
    if (order.payment_status !== "unpaid") return null;
    if (order.cancelled_at !== null) return null;
    if (
      order.fulfillment_status !== "pending" &&
      order.fulfillment_status !== "confirmed"
    ) {
      return null;
    }
    if (
      order.cancel_after_at === null ||
      order.cancel_after_at > now
    ) {
      return null;
    }

    // (3) flip status, set cancel_reason + cancelled_at. Single UPDATE.
    await tx`
      update orders
         set fulfillment_status = 'cancelled'::order_fulfillment_status,
             cancel_reason      = 'auto_unpaid',
             cancelled_at       = ${now},
             updated_at         = now()
       where id = ${orderId}
    `;

    // (4) restore inventory atomically with the cancel.
    await restoreInventory(tx, orderId);

    // (5) write audit row. UNIQUE on order_id means even if two sweeps
    // managed to race past the lock (they shouldn't), the DB rejects
    // the second row and the txn rolls back. We catch the unique-violation
    // here and treat it as a benign duplicate for safety.
    const ageHours =
      (now.getTime() - order.placed_at.getTime()) / 3_600_000;
    await tx`
      insert into auto_cancel_log (
        tenant_id, order_id, threshold_hours, cancelled_at, age_hours
      ) values (
        ${tenantId}, ${orderId}, ${thresholdHours}, ${now}, ${ageHours}
      )
      on conflict (order_id) do nothing
    `;

    return { orderId, tenantId };
  });
}

/**
 * Stamp `cancel_after_at` on a freshly-placed order. Called from
 * placeOrder (lib/commerce/placeOrder.ts). The O20 spec rules the
 * threshold to AUTO_CANCEL_HOURS (default 48h).
 *
 * Exported for use by the placeOrder patch below; NOT a public API.
 */
export function computeCancelAfterAt(
  now: Date,
  thresholdHours: number = autoCancelHoursFromEnv(),
): Date {
  return new Date(now.getTime() + thresholdHours * 3_600_000);
}
