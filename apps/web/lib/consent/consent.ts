// Cookie consent — single source of truth for the banner + localStorage key.
//
// Categories:
//   essential  — always on (login session cookie, CSRF, cart). Cannot be opted out.
//   analytics  — Umami/GA4 (PII-stripped, no cross-site tracking).
//   marketing  — Meta Pixel, TikTok Pixel, Google Ads conversion. Only loaded if accepted.
//
// Storage shape (localStorage key = "hybrid_consent"):
//   { v: 1, ts: <epoch_ms>, essential: true, analytics: bool, marketing: bool }
//
// We re-read this on every page load (client-side, after hydration) and
// gate the analytics/marketing scripts accordingly. The banner only appears
// when no decision has been recorded yet.

export const CONSENT_KEY = "hybrid_consent";
export const CONSENT_VERSION = 1;

export type ConsentCategory = "essential" | "analytics" | "marketing";

export type ConsentState = {
  v: number;
  ts: number;
  essential: true; // always true
  analytics: boolean;
  marketing: boolean;
};

export const DEFAULT_CONSENT: ConsentState = {
  v: CONSENT_VERSION,
  ts: 0,
  essential: true,
  analytics: false,
  marketing: false,
};

export function readConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed.v !== CONSENT_VERSION) return null; // re-prompt on schema bump
    return parsed;
  } catch {
    return null;
  }
}

export function writeConsent(choice: {
  analytics: boolean;
  marketing: boolean;
}): ConsentState {
  const next: ConsentState = {
    v: CONSENT_VERSION,
    ts: Date.now(),
    essential: true,
    analytics: choice.analytics,
    marketing: choice.marketing,
  };
  window.localStorage.setItem(CONSENT_KEY, JSON.stringify(next));
  // Fire a DOM event so analytics/marketing scripts can react without a
  // page reload — they listen for `hybrid:consent-changed`.
  window.dispatchEvent(new CustomEvent("hybrid:consent-changed", { detail: next }));
  return next;
}

export function acceptAll(): ConsentState {
  return writeConsent({ analytics: true, marketing: true });
}

export function acceptEssentialOnly(): ConsentState {
  return writeConsent({ analytics: false, marketing: false });
}

export function isAllowed(
  state: ConsentState | null,
  category: ConsentCategory,
): boolean {
  if (category === "essential") return true;
  if (!state) return false; // no decision yet → don't run
  return state[category] === true;
}