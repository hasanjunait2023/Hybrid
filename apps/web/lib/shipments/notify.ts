// Postgres LISTEN/NOTIFY wrapper for real-time shipment status events.
// The 28_shipment_notify.sql trigger emits NOTIFY shipment_event on INSERT
// and on UPDATE when status changes. This module wires it to the SSE endpoint.
//
// Mirrors the pattern in lib/orders/notify.ts.

import { adminSql } from "@hybrid/db";

export interface ShipmentNotification {
  type: "insert" | "update";
  shipmentId: string;
  tenantId: string;
  orderId: string;
  status: string;
  trackingNumber: string | null;
  at: string;
}

interface Subscription {
  unsubscribe(): Promise<void>;
}

const NOTIFY_CHANNEL = "shipment_event";

export async function getShipmentNotificationStream(
  tenantId: string,
  onEvent: (event: ShipmentNotification) => void,
): Promise<Subscription> {
  let closed = false;

  const listener = (payload: string) => {
    if (closed) return;
    try {
      const data = JSON.parse(payload) as Record<string, unknown>;
      if (data.tenant_id !== tenantId) return;
      onEvent({
        type: data.type === "insert" ? "insert" : "update",
        shipmentId: String(data.shipment_id),
        tenantId: String(data.tenant_id),
        orderId: String(data.order_id),
        status: String(data.status ?? ""),
        trackingNumber: data.tracking_number != null ? String(data.tracking_number) : null,
        at: String(data.at ?? ""),
      });
    } catch {
      // Malformed payload — skip
    }
  };

  await adminSql.listen(NOTIFY_CHANNEL, listener);

  return {
    async unsubscribe() {
      closed = true;
    },
  };
}
