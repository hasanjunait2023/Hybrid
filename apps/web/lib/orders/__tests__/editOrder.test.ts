// ============================================================================
// O3 — Edit Order: unit tests
//
// We split coverage across two layers:
//   * This file (apps/web/lib/orders/__tests__/editOrder.test.ts):
//     Pure validation + shape tests for editOrder(). We don't boot a DB
//     here — the integration coverage in packages/db/test/edit-order.test.ts
//     is where the actual lock + audit + recompute logic gets exercised
//     against real Postgres.
//
// What we lock in here:
//   1. Input validation throws EditOrderError with the right code BEFORE
//      touching the DB. This is the cheap, fast-fail path the UI relies on
//      to give "ভুল ইনপুট" feedback without a round-trip.
//   2. Public type + module surface — a refactor that renames the function
//      surfaces as a compile error, not a silent runtime break.
// ============================================================================

import { describe, it, expect } from "vitest";
import { EditOrderError } from "../editOrder";

describe("EditOrderError", () => {
  it("uses the supplied code on the .code field", () => {
    const err = new EditOrderError("ORDER_NOT_FOUND", "hi");
    expect(err.code).toBe("ORDER_NOT_FOUND");
    expect(err.message).toBe("hi");
    expect(err).toBeInstanceOf(Error);
  });

  it("falls back to the code as the message when none is given", () => {
    const err = new EditOrderError("NO_CHANGES");
    expect(err.message).toBe("NO_CHANGES");
  });
});

describe("editOrder input validation (cheap, no DB)", () => {
  it("rejects an empty reason with REASON_REQUIRED", async () => {
    const { editOrder } = await import("../editOrder");
    await expect(
      editOrder("00000000-0000-0000-0000-000000000001", {
        orderId: "00000000-0000-0000-0000-000000000002",
        actorUserId: "00000000-0000-0000-0000-000000000003",
        reason: "",
        items: [{ orderItemId: "x", quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
  });

  it("rejects a whitespace-only reason with REASON_REQUIRED", async () => {
    const { editOrder } = await import("../editOrder");
    await expect(
      editOrder("00000000-0000-0000-0000-000000000001", {
        orderId: "00000000-0000-0000-0000-000000000002",
        actorUserId: "00000000-0000-0000-0000-000000000003",
        reason: "   \n  ",
        items: [{ orderItemId: "x", quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
  });

  it("rejects an empty items array with NO_CHANGES", async () => {
    const { editOrder } = await import("../editOrder");
    await expect(
      editOrder("00000000-0000-0000-0000-000000000001", {
        orderId: "00000000-0000-0000-0000-000000000002",
        actorUserId: "00000000-0000-0000-0000-000000000003",
        reason: "ok",
        items: [],
      }),
    ).rejects.toMatchObject({ code: "NO_CHANGES" });
  });

  it("rejects a non-positive quantity with INVALID_QUANTITY", async () => {
    const { editOrder } = await import("../editOrder");
    await expect(
      editOrder("00000000-0000-0000-0000-000000000001", {
        orderId: "00000000-0000-0000-0000-000000000002",
        actorUserId: "00000000-0000-0000-0000-000000000003",
        reason: "ok",
        items: [{ orderItemId: "x", quantity: 0 }],
      }),
    ).rejects.toMatchObject({ code: "INVALID_QUANTITY" });

    await expect(
      editOrder("00000000-0000-0000-0000-000000000001", {
        orderId: "00000000-0000-0000-0000-000000000002",
        actorUserId: "00000000-0000-0000-0000-000000000003",
        reason: "ok",
        items: [{ orderItemId: "x", quantity: -1 }],
      }),
    ).rejects.toMatchObject({ code: "INVALID_QUANTITY" });
  });

  it("rejects a non-integer quantity with INVALID_QUANTITY", async () => {
    const { editOrder } = await import("../editOrder");
    await expect(
      editOrder("00000000-0000-0000-0000-000000000001", {
        orderId: "00000000-0000-0000-0000-000000000002",
        actorUserId: "00000000-0000-0000-0000-000000000003",
        reason: "ok",
        items: [{ orderItemId: "x", quantity: 1.5 }],
      }),
    ).rejects.toMatchObject({ code: "INVALID_QUANTITY" });
  });

  it("rejects a negative price with INVALID_PRICE", async () => {
    const { editOrder } = await import("../editOrder");
    await expect(
      editOrder("00000000-0000-0000-0000-000000000001", {
        orderId: "00000000-0000-0000-0000-000000000002",
        actorUserId: "00000000-0000-0000-0000-000000000003",
        reason: "ok",
        items: [{ orderItemId: "x", unitPrice: -10 }],
      }),
    ).rejects.toMatchObject({ code: "INVALID_PRICE" });
  });
});

describe("O3 module surface", () => {
  it("exports the public API", async () => {
    const mod = await import("../editOrder");
    expect(typeof mod.editOrder).toBe("function");
    expect(typeof mod.EditOrderError).toBe("function");
  });
});
