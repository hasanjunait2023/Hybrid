import { describe, it, expect } from "vitest";
import { DEFAULT_CONSENT, parseConsentCookie, serializeConsent, allGranted, withCategory, readConsentFromCookieHeader, hasConsent } from "../consent";

describe("consent helpers", () => {
  it("default consent denies analytics and marketing", () => {
    expect(DEFAULT_CONSENT.categories.analytics).toBe(false);
    expect(DEFAULT_CONSENT.categories.marketing).toBe(false);
    expect(DEFAULT_CONSENT.categories.necessary).toBe(true);
  });

  it("parseConsentCookie returns default on missing cookie", () => {
    expect(parseConsentCookie(undefined)).toEqual(expect.objectContaining({
      categories: { necessary: true, analytics: false, marketing: false },
      version: 1,
    }));
  });

  it("parseConsentCookie returns default on invalid JSON", () => {
    expect(parseConsentCookie("not-json").categories).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  });

  it("round-trips a granted state", () => {
    const granted = allGranted();
    const parsed = parseConsentCookie(serializeConsent(granted));
    expect(parsed.categories.analytics).toBe(true);
    expect(parsed.categories.marketing).toBe(true);
    expect(parsed.categories.necessary).toBe(true);
    expect(parsed.version).toBe(1);
  });

  it("withCategory toggles a category", () => {
    const s = parseConsentCookie(undefined);
    const next = withCategory(s, "analytics", true);
    expect(next.categories.analytics).toBe(true);
    expect(next.categories.marketing).toBe(false);
  });

  it("necessary cannot be toggled off", () => {
    const s = allGranted();
    const next = withCategory(s, "necessary", false);
    expect(next.categories.necessary).toBe(true);
  });

  it("hasConsent respects categories", () => {
    expect(hasConsent("necessary", DEFAULT_CONSENT)).toBe(true);
    expect(hasConsent("analytics", DEFAULT_CONSENT)).toBe(false);
  });

  it("readConsentFromCookieHeader parses the cookie header", () => {
    const granted = allGranted();
    const header = `other=1; hybrid_consent=${encodeURIComponent(serializeConsent(granted))}`;
    const parsed = readConsentFromCookieHeader(header);
    expect(parsed.categories.analytics).toBe(true);
  });
});
