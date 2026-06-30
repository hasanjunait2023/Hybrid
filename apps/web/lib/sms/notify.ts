// Post-commit order notifications (blueprint Notifications 1.9). Fires the
// customer confirmation + seller alert AFTER the order transaction commits.
//
// NON-BLOCKING by contract: a gateway failure here must never roll back an
// order that already committed, and must never surface as a checkout error to
// the buyer. Every send is caught and logged; the function always resolves.
import { getSmsAdapter } from "./index";
import {
  customerOrderConfirmationSms,
  sellerNewOrderAlertSms,
  customerOrderStatusSms,
  customerRefundSms,
  type OrderNotificationData,
  type OrderStatusNotificationData,
  type StatusChangeKind,
} from "./templates";
import { notifyOrderPlacedWhatsApp } from "@/lib/whatsapp/notify";
import { logSms } from "@/lib/comm/log";

export interface SendOrderNotificationsInput extends OrderNotificationData {
  /** Seller hotline to alert. Null/absent → skip the seller SMS. */
  sellerPhone: string | null;
  /**
   * Tenant id, used ONLY to fire the additive, per-tenant-opt-in WhatsApp
   * confirmation alongside SMS. Optional so existing callers stay valid;
   * absent → WhatsApp is skipped, SMS path unchanged.
   */
  tenantId?: string;
}

// Fire-and-await both messages, swallowing per-message errors. Awaited (not
// detached) so a serverless invocation doesn't terminate mid-send, but failures
// are isolated: one send failing never blocks the other or the caller.
export async function sendOrderNotifications(
  input: SendOrderNotificationsInput,
): Promise<void> {
  const sms = getSmsAdapter();

  // customer order-placed confirmation
  const customerMsg = customerOrderConfirmationSms(input);
  const customerResult = await safeSend(
    () => sms.send(input.customerPhone, customerMsg),
    `customer ${input.customerPhone} order #${input.orderNumber}`,
  );
  // H1 comm-log: persist every attempt — non-blocking failure (swallow).
  if (input.tenantId) {
    void logSms({
      tenantId: input.tenantId,
      customerId: null, // SMS not directly tied to a customer row; keep nullable.
      phone: input.customerPhone,
      templateKey: "customer.order.confirmation",
      body: customerMsg,
      status: customerResult.ok ? "sent" : "failed",
      error: customerResult.error,
    }).catch((err) => console.error("[sms-log] customer log write failed:", err));
  }

  // seller alert (if configured)
  if (input.sellerPhone) {
    const sellerMsg = sellerNewOrderAlertSms(input);
    const sellerResult = await safeSend(
      () => sms.send(input.sellerPhone!, sellerMsg),
      `seller ${input.sellerPhone} order #${input.orderNumber}`,
    );
    if (input.tenantId) {
      void logSms({
        tenantId: input.tenantId,
        customerId: null,
        phone: input.sellerPhone,
        templateKey: "seller.order.new",
        body: sellerMsg,
        status: sellerResult.ok ? "sent" : "failed",
        error: sellerResult.error,
      }).catch((err) => console.error("[sms-log] seller log write failed:", err));
    }
  }

  // WhatsApp customer confirmation — ADDITIVE to SMS, per-tenant opt-in,
  // self-contained non-blocking (notifyOrderPlacedWhatsApp swallows its own
  // errors). Skipped when no tenantId is supplied. Never affects the SMS path.
  if (input.tenantId) {
    await notifyOrderPlacedWhatsApp({
      tenantId: input.tenantId,
      storeName: input.storeName,
      orderNumber: input.orderNumber,
      total: input.total,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
    });
  }
}

async function safeSend(
  send: () => Promise<{ ok: boolean; error?: string }>,
  context: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await send();
    if (!result.ok) {
      console.warn(`[sms] send returned not-ok (${context})`);
      return { ok: false, error: result.error ?? "gateway returned not-ok" };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sms] send failed (${context}):`, message);
    return { ok: false, error: message };
  }
}

// Phase 6 — Status-change notifications (shipped / delivered / cancelled).
// Buyer-facing. Same non-blocking guarantee: a gateway failure here must never
// surface as an order-management error to the merchant.
export async function sendOrderStatusNotification(
  input: OrderStatusNotificationData,
  kind: StatusChangeKind,
): Promise<void> {
  const sms = getSmsAdapter();
  const msg = customerOrderStatusSms(input, kind);
  const result = await safeSend(
    () => sms.send(input.customerPhone, msg),
    `customer ${input.customerPhone} order #${input.orderNumber} status=${kind}`,
  );
  // H1 comm-log: persist every status-change attempt when we have a tenant
  // context. tenantId is optional on OrderStatusNotificationData; absent →
  // skip the log (same contract as order-placed).
  if (input.tenantId) {
    void logSms({
      tenantId: input.tenantId,
      customerId: null,
      phone: input.customerPhone,
      templateKey: `customer.order.${kind}`,
      body: msg,
      status: result.ok ? "sent" : "failed",
      error: result.error,
    }).catch((err) => console.error("[sms-log] status log write failed:", err));
  }
}

// O22 — Refund notifications. Customer-facing. Same non-blocking contract.
// Looks up the customer's phone from the order when needed (the action that
// enqueues this already has orderId, tenantId; we resolve phone + store here).
export async function sendRefundNotification(input: {
  orderId: string;
  amount: number;
  method: "bkash" | "nagad" | "cash";
  tenantId: string;
}): Promise<void> {
  const { orderId, amount, method, tenantId } = input;
  // Resolve order details. The store is a sibling query — we want to render
  // the right storeName in the SMS so the customer knows who refunded them.
  let phone: string | null = null;
  let storeName = "Hybrid";
  let orderNumber = 0;
  try {
    const { withTenant } = await import("@hybrid/db");
    const rows = await withTenant(tenantId, null, (tx) =>
      tx<{
        customer_phone: string;
        store_name: string;
        order_number: number;
      }[]>`
        select c.phone as customer_phone, t.name as store_name, o.order_number
        from orders o
        join customer c on c.id = o.customer_id
        join tenant t on t.id = o.tenant_id
        where o.id = ${orderId}
        limit 1
      `,
    );
    if (rows[0]) {
      phone = rows[0].customer_phone;
      storeName = rows[0].store_name;
      orderNumber = rows[0].order_number;
    }
  } catch (err) {
    console.warn("[sms] refund order lookup failed:", err);
  }
  if (!phone) {
    console.warn(`[sms] refund: no phone found for order ${orderId}`);
    return;
  }
  const sms = getSmsAdapter();
  const msg = customerRefundSms({
    storeName,
    orderNumber,
    amount,
    method,
  });
  const result = await safeSend(
    () => sms.send(phone!, msg),
    `customer ${phone} order #${orderNumber} refund=${amount}`,
  );
  void logSms({
    tenantId,
    customerId: null,
    phone,
    templateKey: "customer.refund",
    body: msg,
    status: result.ok ? "sent" : "failed",
    error: result.error,
  }).catch((err) => console.error("[sms-log] refund log write failed:", err));
}
