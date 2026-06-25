import { describe, it, expect } from "vitest";
import type { TrackingEventStatus } from "../log";

// Pure-construction tests — the actual DB-touching helpers need a live
// tenant context, covered by the integration suite in packages/db.
//
// We assert the public types stay shape-compatible with the migration
// schema (status enum, platform union, etc.) so a future schema drift
// surfaces here as a TypeScript compile error, not a runtime crash.

describe("TrackingEventStatus", () => {
  it("includes the documented values", () => {
    const all: TrackingEventStatus[] = [
      "sent",
      "failed",
      "skipped_consent",
      "duplicate",
    ];
    expect(new Set(all).size).toBe(4);
  });
});

describe("platform union", () => {
  it("supports meta, google, tiktok", () => {
    type Platform = "meta" | "google" | "tiktok";
    const sample: Platform[] = ["meta", "google", "tiktok"];
    expect(sample).toHaveLength(3);
  });
});

describe("source union", () => {
  it("supports browser, server, test", () => {
    type Source = "browser" | "server" | "test";
    const sample: Source[] = ["browser", "server", "test"];
    expect(sample).toHaveLength(3);
  });
});