import { describe, it, expect } from "vitest";
import {
  computeSlaForOrder,
  slaStatusForOrder,
  slaZoneFor,
  SLA_HOURS,
  ALERT_LEAD_HOURS,
} from "../compute";

describe("slaZoneFor", () => {
  it("returns same_city when origin and dest districts match", () => {
    expect(
      slaZoneFor(
        { division: "Dhaka", district: "Dhaka" },
        { division: "Dhaka", district: "Dhaka" },
      ),
    ).toBe("same_city");
  });

  it("returns out_city when only division matches", () => {
    expect(
      slaZoneFor(
        { division: "Dhaka", district: "Dhaka" },
        { division: "Dhaka", district: "Gazipur" },
      ),
    ).toBe("out_city");
  });

  it("returns out_city when divisions differ", () => {
    expect(
      slaZoneFor(
        { division: "Dhaka", district: "Dhaka" },
        { division: "Chattogram", district: "Chattogram" },
      ),
    ).toBe("out_city");
  });
});

describe("computeSlaForOrder", () => {
  const placed = new Date("2026-06-30T10:00:00.000Z");

  it("same_city: handover +48h, delivery +5d (120h)", () => {
    const sla = computeSlaForOrder(
      placed,
      { division: "Dhaka", district: "Dhaka" },
      { division: "Dhaka", district: "Dhaka" },
    );
    expect(sla.zone).toBe("same_city");
    expect(sla.handover.toISOString()).toBe(
      new Date(placed.getTime() + SLA_HOURS.HANDOVER * 3600_000).toISOString(),
    );
    expect(sla.delivery.toISOString()).toBe(
      new Date(
        placed.getTime() + SLA_HOURS.DELIVERY_SAME_CITY * 3600_000,
      ).toISOString(),
    );
    expect(sla.refundWindowClosesAt).toBeNull();
  });

  it("out_city: delivery +10d (240h)", () => {
    const sla = computeSlaForOrder(
      placed,
      { division: "Dhaka", district: "Dhaka" },
      { division: "Chattogram", district: "Chattogram" },
    );
    expect(sla.zone).toBe("out_city");
    expect(sla.delivery.toISOString()).toBe(
      new Date(
        placed.getTime() + SLA_HOURS.DELIVERY_OUT_CITY * 3600_000,
      ).toISOString(),
    );
  });
});

describe("slaStatusForOrder", () => {
  const placed = new Date("2026-06-30T10:00:00.000Z");
  const sla = computeSlaForOrder(
    placed,
    { division: "Dhaka", district: "Dhaka" },
    { division: "Dhaka", district: "Dhaka" },
  );

  it("returns on_time when now is far before the deadline", () => {
    const now = new Date(placed.getTime() + 6 * 3600_000); // 6h after placement
    const status = slaStatusForOrder(now, sla, {
      handoverMet: false,
      deliveryMet: false,
      deliveryFailed: false,
    });
    expect(status.handover).toBe("on_time");
    expect(status.delivery).toBe("on_time");
    expect(status.refundWindow).toBe("not_started");
  });

  it("returns at_risk when inside the lead window", () => {
    // 48h handover deadline. 44h in → 4h left → at_risk (lead=6h).
    const now = new Date(placed.getTime() + 44 * 3600_000);
    const status = slaStatusForOrder(now, sla, {
      handoverMet: false,
      deliveryMet: false,
      deliveryFailed: false,
    });
    expect(status.handover).toBe("at_risk");
    // 5d delivery deadline. 44h in → ~76h left → on_time.
    expect(status.delivery).toBe("on_time");
  });

  it("returns overdue when past the deadline and not yet met", () => {
    const now = new Date(placed.getTime() + 50 * 3600_000); // 2h past handover
    const status = slaStatusForOrder(now, sla, {
      handoverMet: false,
      deliveryMet: false,
      deliveryFailed: false,
    });
    expect(status.handover).toBe("overdue");
  });

  it("returns met when the deadline checkpoint was reached", () => {
    const now = new Date(placed.getTime() + 50 * 3600_000);
    const status = slaStatusForOrder(now, sla, {
      handoverMet: true,
      deliveryMet: false,
      deliveryFailed: false,
    });
    expect(status.handover).toBe("met");
  });

  it("refund window: not_started when no delivery failure recorded", () => {
    const now = new Date(placed.getTime() + 200 * 3600_000);
    const status = slaStatusForOrder(now, sla, {
      handoverMet: true,
      deliveryMet: false,
      deliveryFailed: false,
    });
    expect(status.refundWindow).toBe("not_started");
  });

  it("refund window: open when delivery failed and within 10d", () => {
    const slaWithWindow: typeof sla = {
      ...sla,
      refundWindowClosesAt: new Date(placed.getTime() + 240 * 3600_000),
    };
    const now = new Date(placed.getTime() + 200 * 3600_000); // 40h before close
    const status = slaStatusForOrder(now, slaWithWindow, {
      handoverMet: true,
      deliveryMet: false,
      deliveryFailed: true,
    });
    expect(status.refundWindow).toBe("open");
  });

  it("refund window: closed when past the 10d window", () => {
    const slaWithWindow: typeof sla = {
      ...sla,
      refundWindowClosesAt: new Date(placed.getTime() + 240 * 3600_000),
    };
    const now = new Date(placed.getTime() + 250 * 3600_000); // 10h past close
    const status = slaStatusForOrder(now, slaWithWindow, {
      handoverMet: true,
      deliveryMet: false,
      deliveryFailed: true,
    });
    expect(status.refundWindow).toBe("closed");
  });

  it("ALERT_LEAD_HOURS is a sensible positive integer", () => {
    expect(ALERT_LEAD_HOURS).toBeGreaterThan(0);
    expect(Number.isInteger(ALERT_LEAD_HOURS)).toBe(true);
  });
});