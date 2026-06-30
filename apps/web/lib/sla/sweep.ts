// SLA sweeper (BD Digital Commerce Guidelines 2021 — research brief §B.3).
//
// Scans active orders, detects SLA breaches (handover overdue, delivery
// overdue), and pings the merchant once per (order, alert_kind, channel).
// Dedupe is the sla_alert_log UNIQUE constraint — re-runs are idempotent.
//
// Mirrors /api/internal/courier-sync (CRON_SECRET-guarded internal route).
// Designed to be called from the VPS root cron every 30 minutes; cheap enough
// (one indexed range scan over the partial index on orders.sla_*_at filtered
// to active fulfillment statuses).
//
// What this module does NOT do:
//   - touch shipment state. The courier-sync cron is authoritative on that.
//   - auto-escalate. An overdue alert is an SMS to the merchant; the merchant
//     decides whether to call the courier / refund the customer.

import { asPlatformAdmin } from "@hybrid/db";
import { getSmsAdapter } from "@/lib/sms";
import { logSms } from "@/lib/comm/log";
import {
  merchantHandoverOverdueSms,
  merchantDeliveryOverdueSms,
} from "@/lib/sms/templates";

export interface SlaSweepInput {
  /** "now" — caller-supplied so tests are deterministic. */
  now: Date;
}

export interface SlaSweepResult {
  /** Total active orders scanned. */
  scanned: number;
  /** Orders that triggered a new merchant alert this run. */
  alertsSent: number;
  /** Per-kind counts for telemetry. */
  byKind: {
    handoverOverdue: number;
    deliveryOverdue: number;
  };
  /** Non-fatal errors encountered (logged, never thrown). */
  errors: number;
  /** Orders skipped because no merchant phone was on file. */
  skippedNoPhone: number;
}

interface ActiveOrderRow {
  id: string;
  tenant_id: string;
  order_number: number;
  customer_name: string;
  placed_at: Date;
  sla_zone: "same_city" | "out_city";
  sla_handover_deadline_at: Date;
  sla_delivery_deadline_at: Date;
  sla_overridden_by: string | null;
  fulfillment_status:
    | "pending"
    | "confirmed"
    | "packed"
    | "shipped"
    | "in_transit";
  merchant_phone: string | null;
}

export async function runSlaSweep(input: SlaSweepInput): Promise<SlaSweepResult> {
  const result: SlaSweepResult = {
    scanned: 0,
    alertsSent: 0,
    byKind: { handoverOverdue: 0, deliveryOverdue: 0 },
    errors: 0,
    skippedNoPhone: 0,
  };

  // Partial index `orders_sla_sweep_idx` keeps this cheap: it indexes only
  // active orders and the most-frequently-queried column
  // (sla_handover_deadline_at).
  const orders = await asPlatformAdmin((tx) =>
    tx<ActiveOrderRow[]>`
      select
        o.id,
        o.tenant_id,
        o.order_number,
        o.customer_name,
        o.placed_at,
        o.sla_zone,
        o.sla_handover_deadline_at,
        o.sla_delivery_deadline_at,
        o.sla_overridden_by,
        o.fulfillment_status,
        m.phone as merchant_phone
      from orders o
      left join lateral (
        select au.phone
        from app_user au
        join tenant_member tm on tm.user_id = au.id
        where tm.tenant_id = o.tenant_id
          and tm.role = 'owner'
        limit 1
      ) m on true
      where o.fulfillment_status in ('pending','confirmed','packed','shipped','in_transit')
        and o.sla_overridden_by is null
        and o.sla_handover_deadline_at is not null
    `,
  );

  result.scanned = orders.length;
  const now = input.now;

  for (const order of orders) {
    try {
      const handoverOverdue = now >= order.sla_handover_deadline_at;
      const deliveryOverdue = now >= order.sla_delivery_deadline_at;

      // Handover-overdue only makes sense while the parcel is still with the
      // merchant. Once the courier has the parcel (status >= 'shipped') we
      // stop worrying about the handover SLA — that's a courier problem now.
      const handoverStillRelevant =
        order.fulfillment_status === "pending" ||
        order.fulfillment_status === "confirmed" ||
        order.fulfillment_status === "packed";

      if (handoverOverdue && handoverStillRelevant) {
        const sent = await maybeAlert({
          tenantId: order.tenant_id,
          orderId: order.id,
          merchantPhone: order.merchant_phone,
          alertKind: "handover_overdue",
          renderMessage: () =>
            merchantHandoverOverdueSms({
              orderNumber: order.order_number,
              customerName: order.customer_name,
              hoursOverdue: Math.floor(
                (now.getTime() - order.sla_handover_deadline_at.getTime()) /
                  3_600_000,
              ),
            }),
        });
        if (sent === "sent") {
          result.byKind.handoverOverdue += 1;
          result.alertsSent += 1;
        } else if (sent === "skipped_no_phone") {
          result.skippedNoPhone += 1;
        }
      }

      if (deliveryOverdue) {
        const sent = await maybeAlert({
          tenantId: order.tenant_id,
          orderId: order.id,
          merchantPhone: order.merchant_phone,
          alertKind: "delivery_overdue",
          renderMessage: () =>
            merchantDeliveryOverdueSms({
              orderNumber: order.order_number,
              customerName: order.customer_name,
              daysOverdue: Math.floor(
                (now.getTime() - order.sla_delivery_deadline_at.getTime()) /
                  (24 * 3_600_000),
              ),
              slaZone: order.sla_zone,
            }),
        });
        if (sent === "sent") {
          result.byKind.deliveryOverdue += 1;
          result.alertsSent += 1;
        } else if (sent === "skipped_no_phone") {
          result.skippedNoPhone += 1;
        }
      }
    } catch (err) {
      // One bad order never aborts the sweep.
      result.errors += 1;
      console.error(
        `[sla-sweep] order ${order.id} (tenant ${order.tenant_id}) failed:`,
        err,
      );
    }
  }

  return result;
}

type AlertOutcome = "sent" | "duplicate" | "skipped_no_phone" | "send_failed";

interface AlertInput {
  tenantId: string;
  orderId: string;
  merchantPhone: string | null;
  alertKind: "handover_overdue" | "delivery_overdue";
  renderMessage: () => string;
}

/**
 * Dedupe via sla_alert_log UNIQUE (order_id, alert_kind, channel) + send +
 * log. Returns the outcome so the caller can tally.
 *
 * Order matters: insert the dedupe row BEFORE sending so a stuck gateway
 * can't cause re-pings on the next sweep (the unique constraint fires
 * regardless of the SMS outcome). If the SMS send fails after a successful
 * dedupe insert, we still record "sent" outcome for the run — the merchant
 * will see the order in the admin SLA breach dashboard and self-remediate.
 */
async function maybeAlert(input: AlertInput): Promise<AlertOutcome> {
  if (!input.merchantPhone) return "skipped_no_phone";

  // Dedupe insert. ON CONFLICT DO NOTHING returns 0 rows; check rowCount.
  const dedupeRows = await asPlatformAdmin(async (tx) => {
    const rows = await tx`
      insert into sla_alert_log (tenant_id, order_id, alert_kind, channel)
      values (${input.tenantId}::uuid, ${input.orderId}::uuid, ${input.alertKind}, 'sms')
      on conflict (order_id, alert_kind, channel) do nothing
      returning id
    `;
    return rows;
  });
  if (dedupeRows.length === 0) return "duplicate";

  // Send the SMS via the adapter + log via the comm log.
  const message = input.renderMessage();
  const sms = getSmsAdapter();
  let sendOk = false;
  let sendError: string | undefined;
  try {
    const result = await sms.send(input.merchantPhone, message);
    sendOk = result.ok;
    // SmsSendResult only has `ok` + `messageId`. No structured `error` —
    // the adapter throws on transport errors; non-ok just means gateway
    // returned a non-success envelope.
  } catch (err) {
    sendError = err instanceof Error ? err.message : String(err);
  }

  // Best-effort comm log. Non-blocking — logSms has its own try/catch.
  void logSms({
    tenantId: input.tenantId,
    customerId: null,
    phone: input.merchantPhone,
    templateKey: `sla.${input.alertKind}`,
    body: message,
    status: sendOk ? "sent" : "failed",
    error: sendError,
  }).catch((err) =>
    console.error(`[sla-sweep] sms_log write failed for ${input.orderId}:`, err),
  );

  return sendOk ? "sent" : "send_failed";
}