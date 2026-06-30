// Async SMS queue. Wraps the synchronous sendOrderStatusNotification with
// the Redis-backed queue (lib/queue) so the merchant UI returns to the
// browser instantly, and SMS gateway timeouts never block the order
// completion path.
//
// At deploy-time, the first call to enqueueSms() registers the worker,
// which spins up a single background drainer process inside the Next.js
// server. The drainer blocks on Redis BRPOP — no polling, no CPU spin.
//
// Idempotency: callers may enqueue the same status twice (e.g. merchant
// clicks "Mark Delivered" twice). The receiver path in notify.ts is already
// idempotent at the SMS-gateway level (a duplicate send is harmless), so we
// don't add a dedup key here.

import { registerHandler, enqueue } from "../queue/queue";
import {
  sendOrderStatusNotification,
  sendRefundNotification,
  sendAutoCancelNotification,
  sendOrderEditedNotification,
  sendCartRecoveryNotification,
} from "../sms/notify";
import {
  type OrderStatusNotificationData,
  type StatusChangeKind,
} from "../sms/templates";

const QUEUE_NAME = "sms-status";
const QUEUE_NAME_REFUND = "sms-refund";
const QUEUE_NAME_AUTO_CANCEL = "sms-auto-cancel";
const QUEUE_NAME_ORDER_EDITED = "sms-order-edited";
const QUEUE_NAME_CART_RECOVERY = "sms-cart-recovery";

type StatusSmsJob = {
  data: OrderStatusNotificationData;
  kind: StatusChangeKind;
};

type RefundSmsJob = {
  orderId: string;
  amount: number;
  method: "bkash" | "nagad" | "cash";
  tenantId: string;
};

type AutoCancelSmsJob = {
  orderId: string;
  tenantId: string;
};

type OrderEditedSmsJob = {
  orderId: string;
  tenantId: string;
};

type CartRecoverySmsJob = {
  cartId: string;
  tenantId: string;
  attempt: 1 | 2 | 3;
  recoveryUrl: string;
};

let registered = false;
function ensureRegistered(): void {
  if (registered) return;
  registered = true;
  registerHandler<StatusSmsJob>(QUEUE_NAME, async (job) => {
    await sendOrderStatusNotification(job.data, job.kind);
  });
  registerHandler<RefundSmsJob>(QUEUE_NAME_REFUND, async (job) => {
    await sendRefundNotification(job);
  });
  registerHandler<AutoCancelSmsJob>(QUEUE_NAME_AUTO_CANCEL, async (job) => {
    await sendAutoCancelNotification(job);
  });
  registerHandler<OrderEditedSmsJob>(QUEUE_NAME_ORDER_EDITED, async (job) => {
    await sendOrderEditedNotification(job);
  });
  registerHandler<CartRecoverySmsJob>(QUEUE_NAME_CART_RECOVERY, async (job) => {
    await sendCartRecoveryNotification(job);
  });
}

/**
 * Enqueue a status-change SMS. Non-blocking — returns once the job is on
 * the Redis list. The actual send happens 5-30s later on the background
 * drainer.
 */
export async function enqueueStatusSms(
  data: OrderStatusNotificationData,
  kind: StatusChangeKind,
): Promise<string> {
  ensureRegistered();
  return enqueue<StatusSmsJob>(QUEUE_NAME, { data, kind });
}

/**
 * Enqueue a refund confirmation SMS (O22). Tells the customer how much was
 * returned via which method. Non-blocking.
 */
export async function enqueueRefundSms(job: {
  orderId: string;
  amount: number;
  method: "bkash" | "nagad" | "cash";
  tenantId: string;
}): Promise<string> {
  ensureRegistered();
  return enqueue<RefundSmsJob>(QUEUE_NAME_REFUND, job);
}

/**
 * Enqueue an auto-cancel notification (O20). The sweep does this AFTER the
 * orders row has been flipped to 'cancelled' / cancel_reason='auto_unpaid';
 * the SMS is a gentle "you can re-order any time" message. Non-blocking
 * so the cron never waits on the gateway.
 */
export async function enqueueAutoCancelSms(job: {
  orderId: string;
  tenantId: string;
}): Promise<string> {
  ensureRegistered();
  return enqueue<AutoCancelSmsJob>(QUEUE_NAME_AUTO_CANCEL, job);
}

/**
 * Enqueue an order-edited notification (O3). The merchant UI fires this
 * after editOrder() commits a line-item change. Tells the customer the
 * order was updated and the new grand total. Non-blocking so a gateway
 * hiccup never blocks the merchant's save.
 */
export async function enqueueOrderEditedSms(job: {
  orderId: string;
  tenantId: string;
}): Promise<string> {
  ensureRegistered();
  return enqueue<OrderEditedSmsJob>(QUEUE_NAME_ORDER_EDITED, job);
}

/**
 * Enqueue a cart-recovery SMS (O16). Sent by the cart-recovery cron
 * after it picks an abandoned cart and stamps the recovery_attempts
 * counter. Non-blocking so a gateway hiccup never blocks the sweep.
 */
export async function enqueueCartRecoverySms(job: {
  cartId: string;
  tenantId: string;
  attempt: 1 | 2 | 3;
  recoveryUrl: string;
}): Promise<string> {
  ensureRegistered();
  return enqueue<CartRecoverySmsJob>(QUEUE_NAME_CART_RECOVERY, job);
}