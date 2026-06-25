import { describe, it, expect, beforeEach } from "vitest";
import {
  CONSENT_KEY,
  CONSENT_VERSION,
  readConsent,
  writeConsent,
  acceptAll,
  acceptEssentialOnly,
  isAllowed,
  DEFAULT_CONSENT,
  type ConsentState,
} from "../consent";

// Polyfill localStorage + window for tests that run outside the browser.
const store: Record<string, string> = {};

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  // Simulate a browser localStorage.
  (globalThis as { window?: object }).window = {
    localStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    },
    dispatchEvent: () => true,
  };
});

describe("readConsent", () => {
  it("returns null when nothing is stored", () => {
    expect(readConsent()).toBeNull();
  });

  it("returns null when stored version is stale", () => {
    const stale: ConsentState = {
      v: CONSENT_VERSION - 1,
      ts: 0,
      essential: true,
      analytics: true,
      marketing: true,
    };
    store[CONSENT_KEY] = JSON.stringify(stale);
    expect(readConsent()).toBeNull();
  });

  it("returns the stored state when current", () => {
    const cur: ConsentState = {
      v: CONSENT_VERSION,
      ts: 1,
      essential: true,
      analytics: true,
      marketing: false,
    };
    store[CONSENT_KEY] = JSON.stringify(cur);
    expect(readConsent()).toEqual(cur);
  });
});

describe("writeConsent / acceptAll / acceptEssentialOnly", () => {
  it("acceptAll stores all categories true", () => {
    const s = acceptAll();
    expect(s).toEqual({
      v: CONSENT_VERSION,
      ts: expect.any(Number) as unknown as number,
      essential: true,
      analytics: true,
      marketing: true,
    });
    expect(readConsent()).not.toBeNull();
  });

  it("acceptEssentialOnly stores analytics + marketing false", () => {
    const s = acceptEssentialOnly();
    expect(s.analytics).toBe(false);
    expect(s.marketing).toBe(false);
    expect(s.essential).toBe(true);
  });

  it("writeConsent timestamps the choice", () => {
    const before = Date.now();
    const s = writeConsent({ analytics: true, marketing: false });
    expect(s.ts).toBeGreaterThanOrEqual(before);
  });
});

describe("isAllowed", () => {
  it("essential is always allowed even with null state", () => {
    expect(isAllowed(null, "essential")).toBe(true);
  });

  it("analytics + marketing require a decision", () => {
    expect(isAllowed(null, "analytics")).toBe(false);
    expect(isAllowed(null, "marketing")).toBe(false);
  });

  it("respects the stored choice", () => {
    const s = writeConsent({ analytics: true, marketing: false });
    expect(isAllowed(s, "analytics")).toBe(true);
    expect(isAllowed(s, "marketing")).toBe(false);
  });
});

describe("DEFAULT_CONSENT", () => {
  it("is conservative — no analytics or marketing", () => {
    expect(DEFAULT_CONSENT.analytics).toBe(false);
    expect(DEFAULT_CONSENT.marketing).toBe(false);
    expect(DEFAULT_CONSENT.essential).toBe(true);
  });
});