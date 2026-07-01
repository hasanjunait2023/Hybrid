// Cookie consent for the analytics pipeline (Phase D / TRACK-V2-D1).
//
// BD Digital Security Act + GDPR-style consent: every client tracker
// (Meta Pixel, GA4 gtag, Microsoft Clarity, GTM) must check the
// user's consent before injecting a script or firing an event. First-
// party, server-side analytics_event writes are still allowed under
// "necessary" consent (the blueprint 2.7 contract — first-party data
// is the buyer's own record of their session, no third party).
//
// The consent state is stored in a single first-party cookie
// `hybrid_consent`. We use a JSON shape so future categories
// (e.g. personalization, AI training) can be added without a
// version bump. The cookie is SameSite=Lax, Path=/, expires in 1y.
// We never store consent in localStorage because it can be cleared
// independently of the cookie and that creates phantom-consent
// (banner hidden, but real consent revoked).
//
// Default state on FIRST visit: necessary=true, analytics=false,
// marketing=false. This is "deny by default" — required for the
// Digital Security Act and for Meta's own Pixel Terms (consent must
// be explicit). A user MUST click "Accept all" or a category toggle
// for the corresponding scripts to load.
export type ConsentCategory = "necessary" | "analytics" | "marketing";

/** Shape of the consent cookie payload. */
export interface ConsentState {
  /** ISO timestamp the user last saved the consent. */
  updatedAt: string;
  /** Category -> granted. "necessary" is always true. */
  categories: Record<ConsentCategory, boolean>;
  /** Schema version — bump when adding/removing a category. */
  version: 1;
}

export const CONSENT_COOKIE_NAME = "hybrid_consent";
/** 365 days — Digital Security Act & IAB TCF both treat 6-13mo as valid. */
export const CONSENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Default state when no cookie is present or it can't be parsed. */
export const DEFAULT_CONSENT: ConsentState = {
  updatedAt: new Date(0).toISOString(),
  categories: {
    // `necessary` is the foundation of the product (cart, session,
    // login). It is always true and the banner's "Necessary only"
    // button does not change it.
    necessary: true,
    analytics: false,
    marketing: false,
  },
  version: 1,
};

/** Cheap boolean helper. Treats missing/invalid as default-deny. */
export function hasConsent(
  category: ConsentCategory,
  state: ConsentState,
): boolean {
  // Defensive: even if someone hand-edits the cookie to `false`, the
  // necessary category is implicitly always allowed. The store/
  // checkout depend on it.
  if (category === "necessary") return true;
  return Boolean(state.categories[category]);
}

/**
 * Parse the `hybrid_consent` cookie value. Robust against:
 *   - missing cookie (returns DEFAULT_CONSENT)
 *   - malformed JSON (returns DEFAULT_CONSENT; logs to stderr once)
 *   - wrong version (returns DEFAULT_CONSENT; old banner shouldn't
 *     silently grant)
 *   - unknown categories (drop them, keep known ones)
 */
export function parseConsentCookie(value: string | undefined | null): ConsentState {
  if (!value) return cloneDefault();
  try {
    const parsed = JSON.parse(value) as Partial<ConsentState> & {
      categories?: Record<string, unknown>;
    };
    if (!parsed || typeof parsed !== "object") return cloneDefault();
    if (parsed.version !== 1) return cloneDefault();
    const cats = (parsed.categories ?? {}) as Record<string, unknown>;
    const granted = {
      necessary: true,
      analytics: false,
      marketing: false,
    };
    if (typeof cats.analytics === "boolean") granted.analytics = cats.analytics;
    if (typeof cats.marketing === "boolean") granted.marketing = cats.marketing;
    return {
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      version: 1,
      categories: granted,
    };
  } catch (err) {
    // Don't throw — a corrupt cookie must not break the page.
    console.warn("[analytics] parseConsentCookie: invalid JSON:", (err as Error).message);
    return cloneDefault();
  }
}

/** Serialize a consent state to the cookie string. */
export function serializeConsent(state: ConsentState): string {
  return JSON.stringify(state);
}

/** Merge a partial category change on top of the current state. */
export function withCategory(
  state: ConsentState,
  category: ConsentCategory,
  granted: boolean,
): ConsentState {
  if (category === "necessary") {
    // necessary cannot be opted out of — silently ignore.
    return state;
  }
  return {
    ...state,
    updatedAt: new Date().toISOString(),
    categories: { ...state.categories, [category]: Boolean(granted) },
  };
}

/** Build a fresh "all categories granted" state. */
export function allGranted(): ConsentState {
  return {
    updatedAt: new Date().toISOString(),
    version: 1,
    categories: { necessary: true, analytics: true, marketing: true },
  };
}

function cloneDefault(): ConsentState {
  return {
    updatedAt: DEFAULT_CONSENT.updatedAt,
    version: 1,
    categories: { necessary: true, analytics: false, marketing: false },
  };
}

/**
 * Server-safe read of the consent cookie. Returns the default state
 * when missing/invalid. Useful for Server Components that want to
 * pass a "should the client tracker fire?" decision down to a
 * client island.
 *
 * Note: for the consent banner itself, the cookie is read in the
 * browser via the `cookieStore` (the cookie is httpOnly=false by
 * design — the banner needs to read it on every page load).
 */
export function readConsentFromCookieHeader(
  cookieHeader: string | null | undefined,
): ConsentState {
  if (!cookieHeader) return cloneDefault();
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    if (k !== CONSENT_COOKIE_NAME) continue;
    const v = pair.slice(idx + 1).trim();
    return parseConsentCookie(decodeURIComponent(v));
  }
  return cloneDefault();
}
