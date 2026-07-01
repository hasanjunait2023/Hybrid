import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendTikTokEvent, type TikTokCreds } from "../tiktok";
import { fireTikTokPixel } from "../tiktok-pixel";
import type { PurchasePayload } from "../events";

// Cast the mocked fetch and its calls in a type-safe way.
function getFetchMock(): ReturnType<typeof vi.fn> {
  return fetch as ReturnType<typeof vi.fn>;
}

describe("tiktok server sender", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env = { ...originalEnv, TIKTOK_ENABLED: "true" };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = originalEnv;
  });

  const payload: PurchasePayload = {
    eventId: "evt-123",
    orderNumber: 42,
    value: 1500,
    currency: "BDT",
    items: [{ id: "sku-1", name: "Shirt", price: 1500, quantity: 1 }],
  };

  it("returns false when TIKTOK_ENABLED is not true", async () => {
    process.env.TIKTOK_ENABLED = "false";
    const result = await sendTikTokEvent({ pixelId: "px", accessToken: "tok" }, payload);
    expect(result).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns false when creds missing", async () => {
    const result = await sendTikTokEvent({ pixelId: "", accessToken: "" }, payload);
    expect(result).toBe(false);
  });

  it("sends a request and returns true on success", async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"code": 0}',
    });

    const creds: TikTokCreds = { pixelId: "px123", accessToken: "tok123" };
    const result = await sendTikTokEvent(creds, payload, { tenantId: "t1", userId: "u1" });
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, ...unknown[]];
    expect(url).toContain("open_api/v1.3/event/track/");
  });

  it("returns false on HTTP error", async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"code":40001,"message":"bad"}',
    });

    const result = await sendTikTokEvent(
      { pixelId: "px", accessToken: "tok" },
      payload,
      { tenantId: "t1", userId: "u1" },
    );
    expect(result).toBe(false);
  });
});

describe("fireTikTokPixel browser stub", () => {
  it("does not throw when window is undefined", () => {
    expect(() => fireTikTokPixel("px", {
      eventId: "evt",
      orderNumber: 1,
      value: 100,
      currency: "BDT",
      items: [{ id: "x", name: "Y", price: 100, quantity: 1 }],
    })).not.toThrow();
  });
});
