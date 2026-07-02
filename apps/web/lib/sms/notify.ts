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
  customerOrderAutoCancelledSms,
  customerOrderEditedSms,
  customerCartRecoverySms,
  marketplaceBuyerOrderConfirmationSms,
  type OrderNotificationData,
  type OrderStatusNotificationData,
  type StatusChangeKind,
  type MarketplaceOrderConfirmationData,
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

// Marketplace buyer confirmation — fires once after the saga finalises at
// least one successful sub-order. Non-blocking: failures are swallowed; the
// checkout has already committed.
export async function sendMarketplaceBuyerConfirmation(
  phone: string,
  data: MarketplaceOrderConfirmationData,
): Promise<void> {
  const sms = getSmsAdapter();
  await safeSend(
    () => sms.send(phone, marketplaceBuyerOrderConfirmationSms(data)),
    `marketplace buyer ${phone} (${data.vendorCount} vendors ৳${data.grandTotal})`,
  );
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

// O20 — Auto-cancel-of-unpaid-orders notification. Customer-facing, same
// non-blocking contract as the refund notification. Triggered by the
// /api/internal/auto-cancel-unpaid cron after it has flipped the order to
// 'cancelled' / cancel_reason='auto_unpaid'.
//
// Resolves the customer's phone + the merchant's store name + how many
// hours the order sat unpaid (for the message copy), then composes a
// Bengali "you can re-order any time" message — kept gentle rather than
// alarming, since these are typically forgetful-but-warm leads.
export async function sendAutoCancelNotification(input: {
  orderId: string;
  tenantId: string;
}): Promise<void> {
  const { orderId, tenantId } = input;
  let phone: string | null = null;
  let storeName = "Hybrid";
  let orderNumber = 0;
  let hoursOverdue = 0;
  try {
    const { withTenant } = await import("@hybrid/db");
    const rows = await withTenant(tenantId, null, (tx) =>
      tx<{
        customer_phone: string;
        store_name: string;
        order_number: number;
        cancel_after_at: string | null;
        cancelled_at: string | null;
        placed_at: string;
      }[]>`
        select
          c.phone as customer_phone,
          t.name as store_name,
          o.order_number,
          o.cancel_after_at,
          o.cancelled_at,
          o.placed_at
        from orders o
        join customer c on c.id = o.customer_id
        join tenant t on t.id = o.tenant_id
        where o.id = ${orderId}
        limit 1
      `,
    );
    const row = rows[0];
    if (row) {
      phone = row.customer_phone;
      storeName = row.store_name;
      orderNumber = Number(row.order_number);
      // Best-effort age (hours between placed_at and the actual cancellation).
      // Falls back to 0 if either timestamp is missing (legacy orders).
      if (row.placed_at && row.cancelled_at) {
        const start = new Date(row.placed_at).getTime();
        const end = new Date(row.cancelled_at).getTime();
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
          hoursOverdue = Math.max(1, Math.round((end - start) / 3_600_000));
        }
      }
    }
  } catch (err) {
    console.warn("[sms] auto-cancel order lookup failed:", err);
  }
  if (!phone) {
    console.warn(`[sms] auto-cancel: no phone found for order ${orderId}`);
    return;
  }
  const sms = getSmsAdapter();
  const msg = customerOrderAutoCancelledSms({
    storeName,
    orderNumber,
    hoursOverdue,
  });
  const result = await safeSend(
    () => sms.send(phone!, msg),
    `customer ${phone} order #${orderNumber} auto-cancelled after ${hoursOverdue}h`,
  );
  void logSms({
    tenantId,
    customerId: null,
    phone,
    templateKey: "customer.order.auto_cancelled",
    body: msg,
    status: result.ok ? "sent" : "failed",
    error: result.error,
  }).catch((err) => console.error("[sms-log] auto-cancel log write failed:", err));
}

// O3 — Order-edited notification. Customer-facing, same non-blocking contract
// as the other post-mutation sends. Triggered by the merchant's "Save" on
// the edit-order modal AFTER editOrder() has committed the new line items
// and recomputed grand_total. We resolve the customer's phone + store name
// + the NEW grand total here (the action that enqueued this only has the
// orderId/tenantId), then render the Bengali "your order was updated" copy.
export async function sendOrderEditedNotification(input: {
  orderId: string;
  tenantId: string;
}): Promise<void> {
  const { orderId, tenantId } = input;
  let phone: string | null = null;
  let storeName = "Hybrid";
  let orderNumber = 0;
  let newTotal = 0;
  try {
    const { withTenant } = await import("@hybrid/db");
    const rows = await withTenant(tenantId, null, (tx) =>
      tx<{
        customer_phone: string;
        store_name: string;
        order_number: number;
        grand_total: string;
      }[]>`select c.phone as customer_phone,
                t.name as store_name,
                o.order_number,
                o.grand_total
           from orders o
           join customer c on c.id = o.customer_id
           join tenant t on t.id = o.tenant_id
          where o.id = ${orderId}
          limit 1`,
    );
    const row = rows[0];
    if (row) {
      phone = row.customer_phone;
      storeName = row.store_name;
      orderNumber = Number(row.order_number);
      newTotal = Number(row.grand_total);
    }
  } catch (err) {
    console.warn("[sms] order-edited order lookup failed:", err);
  }
  if (!phone) {
    console.warn(`[sms] order-edited: no phone found for order ${orderId}`);
    return;
  }
  const sms = getSmsAdapter();
  const msg = customerOrderEditedSms({
    storeName,
    orderNumber,
    newTotal,
  });
  const result = await safeSend(
    () => sms.send(phone!, msg),
    `customer ${phone} order #${orderNumber} edited (new total=${newTotal})`,
  );
  void logSms({
    tenantId,
    customerId: null,
    phone,
    templateKey: "customer.order.edited",
    body: msg,
    status: result.ok ? "sent" : "failed",
    error: result.error,
  }).catch((err) => console.error("[sms-log] order-edited log write failed:", err));
}

// O16 — Cart-recovery notification. Called by the cart-recovery sweep
// after it picks an abandoned cart and stamps the recovery_attempts
// counter. The actual cadence (1h / 24h / 72h) and the recovery URL
// are computed by the sweep; this function just sends the message and
// writes the sms_log row. Same non-blocking / best-effort contract as
// the rest of the SMS surface — a gateway hiccup never blocks the
// cron.
export async function sendCartRecoveryNotification(input: {
  cartId: string;
  tenantId: string;
  attempt: 1 | 2 | 3;
  recoveryUrl: string;
}): Promise<void> {
  const { cartId, tenantId, attempt, recoveryUrl } = input;
  let phone: string | null = null;
  let storeName = "Hybrid";
  let cartTotal = 0;
  let itemCount = 0;
  try {
    const { withTenant } = await import("@hybrid/db");
    const rows = await withTenant(tenantId, null, (tx) =>
      tx<
        {
          customer_phone: string;
          store_name: string;
          cart_total: string;
          item_count: number;
        }[]
      >`
        select
          c.phone as customer_phone,
          t.name as store_name,
          c.total as cart_total,
          coalesce(jsonb_array_length(c.items), 0) as item_count
        from cart c
        join tenant t on t.id = c.tenant_id
        where c.id = ${cartId}
        limit 1
      `,
    );
    const row = rows[0];
    if (row) {
      phone = row.customer_phone;
      storeName = row.store_name;
      cartTotal = Number(row.cart_total);
      itemCount = row.item_count;
    }
  } catch (err) {
    console.warn("[sms] cart-recovery lookup failed:", err);
  }
  if (!phone) {
    console.warn(`[sms] cart-recovery: no phone found for cart ${cartId}`);
    return;
  }
  const sms = getSmsAdapter();
  const msg = customerCartRecoverySms({
    storeName,
    cartTotal,
    itemCount,
    recoveryUrl,
    attempt,
  });
  const result = await safeSend(
    () => sms.send(phone!, msg),
    `customer ${phone} cart-recovery attempt #${attempt} (৳${cartTotal})`,
  );
  void logSms({
    tenantId,
    customerId: null,
    phone,
    templateKey: `customer.cart.recovery_${attempt}h`,
    body: msg,
    status: result.ok ? "sent" : "failed",
    error: result.error,
  }).catch((err) => console.error("[sms-log] cart-recovery log write failed:", err));
}
