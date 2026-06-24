// Pathao order/delivery status → internal {shipment_status, order_fulfillment_status}.
//
// Pathao publishes order statuses (Pickup_Requested, Assigned_for_Pickup,
// Picked, At_the_Sorting_HUB, In_Transit, Delivered, Partial_Delivery, Returned,
// Delivery_Failed, On_Hold). Mapped to the internal vocabulary shared with
// Steadfast. Unknown → in_transit (the parcel is somewhere in-network, never
// wrongly terminalized — same rationale as the Steadfast map).
import type { ShipmentStatus, OrderFulfillmentStatus } from "../types";

export interface MappedStatus {
  shipment_status: ShipmentStatus;
  order_fulfillment_status: OrderFulfillmentStatus;
}

const MAP: Record<string, MappedStatus> = {
  pending: { shipment_status: "created", order_fulfillment_status: "confirmed" },
  pickup_requested: { shipment_status: "created", order_fulfillment_status: "confirmed" },
  assigned_for_pickup: { shipment_status: "created", order_fulfillment_status: "confirmed" },
  picked: { shipment_status: "in_transit", order_fulfillment_status: "in_transit" },
  at_the_sorting_hub: { shipment_status: "in_transit", order_fulfillment_status: "in_transit" },
  in_transit: { shipment_status: "in_transit", order_fulfillment_status: "in_transit" },
  on_hold: { shipment_status: "in_transit", order_fulfillment_status: "in_transit" },
  received_at_last_mile_hub: { shipment_status: "in_transit", order_fulfillment_status: "in_transit" },
  assigned_for_delivery: { shipment_status: "in_transit", order_fulfillment_status: "in_transit" },
  delivered: { shipment_status: "delivered", order_fulfillment_status: "delivered" },
  partial_delivery: { shipment_status: "delivered", order_fulfillment_status: "delivered" },
  returned: { shipment_status: "cancelled", order_fulfillment_status: "returned" },
  delivery_failed: { shipment_status: "cancelled", order_fulfillment_status: "returned" },
  return_requested: { shipment_status: "in_transit", order_fulfillment_status: "in_transit" },
};

const UNKNOWN_FALLBACK: MappedStatus = {
  shipment_status: "in_transit",
  order_fulfillment_status: "in_transit",
};

// Map a raw Pathao status string (case-insensitive, spaces/hyphens normalized to
// underscores) to the internal pair. Unknown/unmapped statuses → in_transit.
export function mapPathaoStatus(raw: string): MappedStatus {
  const key = raw?.toLowerCase().trim().replace(/[\s-]+/g, "_");
  return MAP[key] ?? UNKNOWN_FALLBACK;
}

// The documented statuses, exported so the contract test can assert every one.
export const KNOWN_PATHAO_STATUSES = Object.keys(MAP);
