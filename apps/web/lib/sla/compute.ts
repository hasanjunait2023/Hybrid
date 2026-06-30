// SLA (Service Level Agreement) tracking — Digital Commerce Guidelines 2021.
//
// Per the BD Digital Commerce Guidelines 2021, every order has three deadlines
// that merchants must meet (or that bound the customer's refund window):
//
//   1. Courier Handover Deadline  — placed_at + 48h
//        (merchant must hand the parcel to the courier within 2 days)
//   2. Delivery Deadline         — placed_at + 5d (same-city) or +10d (out)
//        (courier must deliver within SLA)
//   3. Refund Window Closes      — (delivery failure / pending) + 10d
//        (customer can claim a refund within 10 days of failed delivery)
//
// This module is the pure-function side:
//   - computeSlaForOrder() — given origin + dest + placed_at, returns deadlines.
//   - slaStatusForOrder()  — given now + stamped deadlines, returns on-time/at-risk/overdue.
//   - ALERT_LEAD_HOURS     — how long before a deadline we ping the merchant.
//
// The sweep logic (DB scans, SMS send, dedupe via sla_alert_log) lives in
// /api/internal/sla-sweep; it imports computeSlaForOrder from here so the math
// stays unit-testable.
//
// NOTE: This file is intentionally pure / dependency-free so it can be
// imported by both server code (lib/sla/sweep.ts) and the admin order detail
// client component (SlaBadges.tsx). DO NOT add imports from @hybrid/db or
// any other module that pulls in postgres / node:crypto — that would break
// the Next.js client bundle build.

/** Two-zone classification we care about for SLA — coarser than the shipping 3-zone model.
 *  "same_city" = origin district == dest district
 *  "out_city"  = different district (covers same_division + other_division) */
export type SlaZone = "same_city" | "out_city";

/**
 * Map (origin, dest) to SLA zone. Self-contained — DO NOT import from
 * lib/commerce/shipping here (it transitively pulls in @hybrid/db which is
 * server-only and breaks the client bundle).
 */
export function slaZoneFor(
  origin: { division: string | null; district: string | null },
  dest: { division: string; district: string },
): SlaZone {
  if (
    origin.district &&
    dest.district &&
    origin.district === dest.district
  ) {
    return "same_city";
  }
  return "out_city";
}

/** SLA durations in hours. Frozen constants per Digital Commerce Guidelines 2021. */
export const SLA_HOURS = {
  /** Merchant must hand to courier within this many hours of order placement. */
  HANDOVER: 48,
  /** Same-city delivery target (hours from placement). */
  DELIVERY_SAME_CITY: 5 * 24,
  /** Out-of-city delivery target (hours from placement). */
  DELIVERY_OUT_CITY: 10 * 24,
  /** Refund window (hours from delivery-failure / pending). */
  REFUND_WINDOW: 10 * 24,
} as const;

/** How long before a deadline we mark it "at_risk" (merchant gets a heads-up).
 *  Set to 6h so the merchant has a working day to act before the breach. */
export const ALERT_LEAD_HOURS = 6;

export interface SlaDeadlines {
  /** placed_at + 48h (handover to courier). */
  handover: Date;
  /** placed_at + 5d OR +10d depending on zone. */
  delivery: Date;
  /** Initially null — set when the order's delivery misses its deadline. */
  refundWindowClosesAt: Date | null;
  /** same_city / out_city — frozen at placement so the timer doesn't drift
   *  if a tenant later changes their origin config. */
  zone: SlaZone;
}

export interface SlaStatus {
  handover: "on_time" | "at_risk" | "overdue" | "met";
  delivery: "on_time" | "at_risk" | "overdue" | "met";
  refundWindow: "closed" | "open" | "not_started";
}

/**
 * Compute SLA deadlines for a fresh order. Pure function (no DB).
 *
 * @param placedAt  When the order was placed (placed_at from DB)
 * @param origin    Tenant's shipping origin (from shipping_config)
 * @param dest      Customer's shipping address (division+district)
 * @returns         Stamped deadlines + zone. refundWindow is null until a
 *                  delivery miss is recorded — see slaStatusForOrder for that
 *                  transition.
 */
export function computeSlaForOrder(
  placedAt: Date,
  origin: { division: string | null; district: string | null },
  dest: { division: string; district: string },
): SlaDeadlines {
  const zone = slaZoneFor(origin, dest);
  const handover = addHours(placedAt, SLA_HOURS.HANDOVER);
  const deliveryHours =
    zone === "same_city"
      ? SLA_HOURS.DELIVERY_SAME_CITY
      : SLA_HOURS.DELIVERY_OUT_CITY;
  return {
    zone,
    handover,
    delivery: addHours(placedAt, deliveryHours),
    refundWindowClosesAt: null,
  };
}

/**
 * Compute the live SLA status for an order at the given "now".
 * Used by the sweeper and by the admin order detail badge.
 *
 * Semantics:
 *  - handover / delivery: "met" once the corresponding state has been reached
 *    (shipment.status advanced past the deadline's checkpoint).
 *  - refundWindow: "not_started" until a delivery miss opens the window;
 *    "open" while inside the 10d window after a miss; "closed" once elapsed.
 *
 * Caller supplies which deadlines are "met" so this stays a pure function
 * (the sweeper determines "met" from the order's fulfillment_status and the
 * shipment's status / delivered_at).
 */
export function slaStatusForOrder(
  now: Date,
  deadlines: SlaDeadlines,
  state: {
    /** True if a shipment has been created and picked_up (i.e. courier handover happened). */
    handoverMet: boolean;
    /** True if delivered_at is set (delivery completed). */
    deliveryMet: boolean;
    /** True if delivery missed its deadline (drives the refund window). */
    deliveryFailed: boolean;
  },
): SlaStatus {
  return {
    handover: state.handoverMet
      ? "met"
      : bucket(now, deadlines.handover, ALERT_LEAD_HOURS),
    delivery: state.deliveryMet
      ? "met"
      : bucket(now, deadlines.delivery, ALERT_LEAD_HOURS),
    refundWindow: computeRefundStatus(now, deadlines, state),
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 3_600_000);
}

function bucket(
  now: Date,
  deadline: Date,
  leadHours: number,
): "on_time" | "at_risk" | "overdue" {
  const ms = deadline.getTime() - now.getTime();
  if (ms <= 0) return "overdue";
  if (ms <= leadHours * 3_600_000) return "at_risk";
  return "on_time";
}

function computeRefundStatus(
  now: Date,
  deadlines: SlaDeadlines,
  state: { deliveryFailed: boolean },
): "closed" | "open" | "not_started" {
  if (!state.deliveryFailed) return "not_started";
  if (!deadlines.refundWindowClosesAt) return "not_started";
  return now.getTime() >= deadlines.refundWindowClosesAt.getTime()
    ? "closed"
    : "open";
}