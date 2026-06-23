// Steadfast delivery_status → internal {shipment_status, order_fulfillment_status}.
//
// Per the Phase-1 blueprint / integration brief:
//   pending, in_review                    → created   / confirmed
//   hold, delivered_approval_pending      → in_transit / in_transit
//   delivered, partial_delivered          → delivered  / delivered
//   cancelled                             → cancelled  / returned
//   (any unknown / unmapped status)       → in_transit / in_transit
//
// The unknown→in_transit default is deliberate: an unrecognized live status
// means the parcel is somewhere in the network, not lost — treating it as
// in_transit keeps the order moving rather than wrongly terminalizing it.
import type { ShipmentStatus, OrderFulfillmentStatus } from "./types";

export interface MappedStatus {
  shipment_status: ShipmentStatus;
  order_fulfillment_status: OrderFulfillmentStatus;
}

const MAP: Record<string, MappedStatus> = {
  pending: { shipment_status: "created", order_fulfillment_status: "confirmed" },
  in_review: { shipment_status: "created", order_fulfillment_status: "confirmed" },
  hold: { shipment_status: "in_transit", order_fulfillment_status: "in_transit" },
  delivered_approval_pending: { shipment_status: "in_transit", order_fulfillment_status: "in_transit" },
  delivered: { shipment_status: "delivered", order_fulfillment_status: "delivered" },
  partial_delivered: { shipment_status: "delivered", order_fulfillment_status: "delivered" },
  cancelled: { shipment_status: "cancelled", order_fulfillment_status: "returned" },
};

const UNKNOWN_FALLBACK: MappedStatus = {
  shipment_status: "in_transit",
  order_fulfillment_status: "in_transit",
};

// Map a raw Steadfast status string (case-insensitive) to the internal pair.
// Unknown/unmapped statuses fall back to in_transit.
export function mapSteadfastStatus(raw: string): MappedStatus {
  const key = raw?.toLowerCase().trim();
  return MAP[key] ?? UNKNOWN_FALLBACK;
}

// The documented statuses, exported so the contract test can assert every one.
export const KNOWN_STEADFAST_STATUSES = Object.keys(MAP);
