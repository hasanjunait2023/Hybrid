// ============================================================================
// O20 — Auto-cancel unpaid orders: unit tests
//
// Pure-function tests for the helpers in lib/orders/autoCancel.ts. We keep
// these pure (no DB) and put the end-to-end integration coverage in
// /packages/db/test/auto-cancel-unpaid.test.ts which boots the same
// embedded-postgres as the rest of the suite.
//
// What we lock in here:
//   * autoCancelHoursFromEnv() respects AUTO_CANCEL_HOURS, falls back to 48.
//   * computeCancelAfterAt() adds the threshold to the base Date correctly.
//   * The public API surface of runAutoCancelSweep so a refactor surfaces
//     a compile error instead of a runtime crash in production.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("autoCancelHoursFromEnv", () => {
  const ORIGINAL = process.env.AUTO_CANCEL_HOURS;
  beforeEach(() => {
    delete process.env.AUTO_CANCEL_HOURS;
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.AUTO_CANCEL_HOURS;
    else process.env.AUTO_CANCEL_HOURS = ORIGINAL;
  });

  it("returns 48 (default) when AUTO_CANCEL_HOURS is unset", async () => {
    const { autoCancelHoursFromEnv } = await import("../autoCancel");
    expect(autoCancelHoursFromEnv()).toBe(48);
  });

  it("returns 48 when AUTO_CANCEL_HOURS is empty string", async () => {
    process.env.AUTO_CANCEL_HOURS = "";
    const { autoCancelHoursFromEnv } = await import("../autoCancel");
    expect(autoCancelHoursFromEnv()).toBe(48);
  });

  it("parses positive integer override", async () => {
    process.env.AUTO_CANCEL_HOURS = "72";
    const { autoCancelHoursFromEnv } = await import("../autoCancel");
    expect(autoCancelHoursFromEnv()).toBe(72);
  });

  it("falls back to 48 on non-numeric input", async () => {
    process.env.AUTO_CANCEL_HOURS = "not-a-number";
    const { autoCancelHoursFromEnv } = await import("../autoCancel");
    expect(autoCancelHoursFromEnv()).toBe(48);
  });

  it("falls back to 48 on zero or negative input", async () => {
    process.env.AUTO_CANCEL_HOURS = "0";
    const { autoCancelHoursFromEnv } = await import("../autoCancel");
    expect(autoCancelHoursFromEnv()).toBe(48);

    process.env.AUTO_CANCEL_HOURS = "-1";
    expect(autoCancelHoursFromEnv()).toBe(48);
  });
});

describe("computeCancelAfterAt", () => {
  it("offsets placedAt by the given threshold hours", async () => {
    const { computeCancelAfterAt } = await import("../autoCancel");
    const placed = new Date("2026-06-30T10:00:00.000Z");
    const cancel = computeCancelAfterAt(placed, 48);
    expect(cancel.toISOString()).toBe(
      new Date(placed.getTime() + 48 * 3_600_000).toISOString(),
    );
  });

  it("reads threshold from env when not passed", async () => {
    const ORIGINAL = process.env.AUTO_CANCEL_HOURS;
    process.env.AUTO_CANCEL_HOURS = "24";
    try {
      const { computeCancelAfterAt } = await import("../autoCancel");
      const placed = new Date("2026-06-30T10:00:00.000Z");
      const cancel = computeCancelAfterAt(placed);
      expect(cancel.toISOString()).toBe(
        new Date(placed.getTime() + 24 * 3_600_000).toISOString(),
      );
    } finally {
      if (ORIGINAL === undefined) delete process.env.AUTO_CANCEL_HOURS;
      else process.env.AUTO_CANCEL_HOURS = ORIGINAL;
    }
  });
});

describe("O20 module surface", () => {
  it("exports the public types so a refactor surfaces a compile error", async () => {
    // The orchestrator itself is exercised in the integration suite. Here we
    // just lock the public API so future edits don't silently rename
    // things.
    const mod = await import("../autoCancel");
    expect(typeof mod.runAutoCancelSweep).toBe("function");
    expect(typeof mod.autoCancelHoursFromEnv).toBe("function");
    expect(typeof mod.computeCancelAfterAt).toBe("function");
  });
});
