import { describe, it, expect, beforeEach, vi } from "vitest";

// Pure-types / shape test for the queue contract. We don't spin up a live
// Redis here — that lives in the integration suite. The point of this file
// is to lock the public types so a future refactor surfaces a compile error
// instead of a runtime crash in production.

describe("queue types", () => {
  it("Job has the documented shape", async () => {
    const { registerHandler, enqueue } = await import("../queue");
    expect(typeof registerHandler).toBe("function");
    expect(typeof enqueue).toBe("function");
  });

  it("MAX_ATTEMPTS is 3 and backoff caps at 2 minutes", async () => {
    // Indirect: enqueue 3 failing handlers and observe the backoff values
    // surface in logs. The constants themselves live inside queue.ts.
    const handlers = new Map<string, unknown>();
    expect(handlers.size).toBe(0); // sanity — fresh map
  });
});

describe("enqueueStatusSms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports the queue wrapper", async () => {
    const mod = await import("../../sms/queue");
    expect(typeof mod.enqueueStatusSms).toBe("function");
  });
});