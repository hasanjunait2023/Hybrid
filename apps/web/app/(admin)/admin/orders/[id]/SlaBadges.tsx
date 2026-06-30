"use client";
// SLA status badges for the admin order detail page (BD Digital Commerce
// Guidelines 2021). Server-side SLA deadline math lives in @/lib/sla/compute;
// this component renders the live "now" status + absolute deadlines.
//
// All copy is Bengali per the rest of the admin surface.

import { useEffect, useState } from "react";
import {
  slaStatusForOrder,
  type SlaDeadlines,
  type SlaStatus,
} from "@/lib/sla/compute";

export interface SlaBadgesProps {
  /** The deadlines stamped at order placement (or null for legacy orders). */
  deadlines: {
    zone: "same_city" | "out_city" | null;
    handoverDeadlineAt: string | null;
    deliveryDeadlineAt: string | null;
    refundWindowClosesAt: string | null;
  } | null;
  fulfillmentStatus:
    | "pending"
    | "confirmed"
    | "packed"
    | "shipped"
    | "in_transit"
    | "delivered"
    | "returned"
    | "cancelled";
  deliveredAt: string | null;
}

export function SlaBadges(props: SlaBadgesProps) {
  // Re-evaluate "now" once per minute on the client so the at-risk/overdue
  // transitions happen visually without a refetch. Server already renders the
  // initial state at page-load.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!props.deadlines?.handoverDeadlineAt) {
    return (
      <span className="text-xs text-ink-muted">
        এই অর্ডারের SLA ট্র্যাকিং নেই (পুরনো অর্ডার)
      </span>
    );
  }

  const deadlines: SlaDeadlines = {
    zone: props.deadlines.zone ?? "same_city",
    handover: new Date(props.deadlines.handoverDeadlineAt),
    delivery: new Date(props.deadlines.deliveryDeadlineAt!),
    refundWindowClosesAt: props.deadlines.refundWindowClosesAt
      ? new Date(props.deadlines.refundWindowClosesAt)
      : null,
  };

  const status: SlaStatus = slaStatusForOrder(now, deadlines, {
    handoverMet:
      props.fulfillmentStatus !== "pending" &&
      props.fulfillmentStatus !== "confirmed" &&
      props.fulfillmentStatus !== "packed",
    deliveryMet: props.fulfillmentStatus === "delivered",
    // Delivery failure requires manual flip today; until we wire that into
    // courier-sync, the refund window always reads "not_started".
    deliveryFailed: false,
  });

  const zoneLabel =
    deadlines.zone === "same_city" ? "শহরের মধ্যে" : "শহরের বাইরে";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge kind="handover" value={status.handover} />
      <Badge kind="delivery" value={status.delivery} />
      <span className="text-xs text-ink-muted">({zoneLabel})</span>
    </div>
  );
}

function Badge({
  kind,
  value,
}: {
  kind: "handover" | "delivery";
  value: "on_time" | "at_risk" | "overdue" | "met";
}) {
  const tone = (() => {
    switch (value) {
      case "met":
        return "bg-success/15 text-success";
      case "on_time":
        return "bg-surface-2 text-ink-muted";
      case "at_risk":
        return "bg-warning/15 text-warning";
      case "overdue":
        return "bg-error/15 text-error";
    }
  })();
  const label = (() => {
    const target = kind === "handover" ? "হ্যান্ডওভার" : "ডেলিভারি";
    switch (value) {
      case "met":
        return `${target} ✓`;
      case "on_time":
        return `${target} সময়মতো`;
      case "at_risk":
        return `${target} ঝুঁকিতে`;
      case "overdue":
        return `${target} বিলম্বিত`;
    }
  })();
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}
    >
      {label}
    </span>
  );
}