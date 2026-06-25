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
import { sendOrderStatusNotification } from "../sms/notify";
import {
  type OrderStatusNotificationData,
  type StatusChangeKind,
} from "../sms/templates";

const QUEUE_NAME = "sms-status";

type StatusSmsJob = {
  data: OrderStatusNotificationData;
  kind: StatusChangeKind;
};

let registered = false;
function ensureRegistered(): void {
  if (registered) return;
  registered = true;
  registerHandler<StatusSmsJob>(QUEUE_NAME, async (job) => {
    await sendOrderStatusNotification(job.data, job.kind);
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