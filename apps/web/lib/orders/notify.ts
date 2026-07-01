// Postgres LISTEN/NOTIFY wrapper for real-time order events. The hybrid
// schema installs a trigger (10_notify.sql) that emits NOTIFY order_event
// whenever an order is inserted/updated. This module opens a dedicated
// connection per subscriber (Next.js route handler) and filters by tenant.

import { adminSql } from "@hybrid/db";

export interface OrderNotification {
  type: "insert" | "update";
  orderId: string;
  tenantId: string;
  orderNumber: number;
  fulfillmentStatus: string;
  paymentStatus: string;
  grandTotal: number;
  at: string;
}

interface Subscription {
  unsubscribe(): Promise<void>;
}

const NOTIFY_CHANNEL = "order_event";

/**
 * Subscribe to order events for a given tenant. Returns an object with
 * `unsubscribe()` to release the listener. Caller MUST call unsubscribe
 * when done (route handler abort signal is the typical trigger).
 *
 * Uses the existing adminSql connection (postgres.js) — single shared
 * connection, all subscribers share one LISTEN channel. Tenant filtering
 * happens in the listener callback.
 */
export async function getOrderNotificationStream(
  tenantId: string,
  onEvent: (event: OrderNotification) => void,
): Promise<Subscription> {
  let closed = false;

  // postgres.js .listen(channel, callback) — single shared listener per
  // channel, multiple subscribers get the same callback fired. Track our
  // own unsubscribe so we can detach just our callback.
  const listener = (payload: string) => {
    if (closed) return;
    try {
      const data = JSON.parse(payload) as Record<string, unknown>;
      // Tenant filter — ignore events for other stores sharing the DB.
      if (data.tenant_id !== tenantId) return;
      onEvent({
        type: data.type === "insert" ? "insert" : "update",
        orderId: String(data.order_id),
        tenantId: String(data.tenant_id),
        orderNumber: Number(data.order_number ?? 0),
        fulfillmentStatus: String(data.fulfillment_status ?? ""),
        paymentStatus: String(data.payment_status ?? ""),
        grandTotal: Number(data.grand_total ?? 0),
        at: String(data.at ?? new Date().toISOString()),
      });
    } catch {
      // Malformed payload — skip
    }
  };

  try {
    await adminSql.listen(NOTIFY_CHANNEL, listener);
  } catch (err) {
    throw new Error(`Order notification stream failed to subscribe: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    async unsubscribe() {
      closed = true;
      // postgres.js doesn't have a per-listener unsubscribe; the LISTEN is
      // tied to the connection. Since adminSql is a long-lived singleton
      // shared by the whole process, we just suppress our own callback via
      // the closed flag. Other subscribers keep receiving events.
      // (For per-subscriber isolation, you'd need a per-tenant dedicated
      //  connection pool — out of scope for v1.)
    },
  };
}
