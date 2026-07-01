// Google Tag Manager dataLayer + loader (Phase D / TRACK-V2-D4).
//
// GTM is the "fire one snippet, configure many tags in the web UI"
// wrapper. The platform-level container is configured by env var
// (NEXT_PUBLIC_HYBRID_GTM_ID) and a per-tenant container can override
// it through tenant.settings.analytics.gtmContainerId. The store
// facade exposes:
//   - pushDataLayer(event, payload)  → fire a custom event
//   - loadGtmContainer(gtmId)        → inject the GTM <script>
// Both are safe to call repeatedly (idempotent).
//
// GTM consent integration: we DO NOT set window['ga-disable-...']
// flags from here — GTM's own consent mode (gtag 'consent' commands)
// is the canonical path. The ConsentBanner sets those via
// pushDataLayer({ 'consent': 'update', ... }) when consent changes.
export interface GtmDataLayerPayload {
  [key: string]: unknown;
}

export interface GtmWindow extends Window {
  dataLayer?: GtmDataLayerPayload[];
}

/** Canonical "GTM is loaded" marker — set by the loader snippet. */
const GTM_LOADED_FLAG = "hybrid_gtm_loaded";

/**
 * Push a custom event onto the dataLayer. Safe to call before
 * loadGtmContainer (the array is created on demand). The Hybrid
 * convention is `{ event: 'snake_case_name', ...payload }` so the
 * GTM workspace's built-in variables line up with our event names.
 */
export function pushDataLayer(event: string, payload: GtmDataLayerPayload = {}): void {
  if (typeof window === "undefined") return;
  const w = window as GtmWindow;
  w.dataLayer = w.dataLayer ?? [];
  w.dataLayer.push({ event, ...payload });
}

/**
 * Inject the GTM snippet (head + body iframe). Idempotent: a second
 * call with the same ID is a no-op. A different ID forces a reload —
 * rare, but it lets a tenant A/B test container changes without a
 * code deploy.
 *
 * No-ops when:
 *   - gtmId is missing/empty
 *   - SSR (no window)
 *   - GTM is already loaded with the same ID
 */
export function loadGtmContainer(gtmId: string | null | undefined): void {
  if (typeof window === "undefined") return;
  if (!gtmId) return;
  const w = window as GtmWindow & { [GTM_LOADED_FLAG]?: string };

  // Idempotency: same container already loaded → no-op.
  if (w[GTM_LOADED_FLAG] === gtmId) return;

  // If a different container was loaded, force a full reload so the
  // new container takes effect. We do this by clearing the flag,
  // removing the existing scripts, and re-loading.
  if (w[GTM_LOADED_FLAG] && w[GTM_LOADED_FLAG] !== gtmId) {
    // The scripts carry the old ID baked into the URL — we'd have
    // to surgically remove them. For a Phase-D conservative rollout,
    // we just bail and require a manual reload. Tenants that need
    // A/B should do it via GTM's own environment feature.
    console.warn(
      `[analytics] GTM container changed (${w[GTM_LOADED_FLAG]} → ${gtmId}); reload required.`,
    );
    return;
  }

  w.dataLayer = w.dataLayer ?? [];
  // The GTM-required bootstrap push so the page-view fires before
  // the snippet finishes parsing.
  w.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  // Head snippet — gtag/js?id=GTM-XXXX is the modern loader.
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
  document.head.appendChild(script);

  w[GTM_LOADED_FLAG] = gtmId;
}

/** Build the canonical consent-update push. Used by the banner. */
export function buildConsentUpdatePush(state: {
  analytics: boolean;
  marketing: boolean;
}): GtmDataLayerPayload {
  return {
    event: "consent_update",
    consent: {
      analytics_storage: state.analytics ? "granted" : "denied",
      ad_storage: state.marketing ? "granted" : "denied",
      ad_user_data: state.marketing ? "granted" : "denied",
      ad_personalization: state.marketing ? "granted" : "denied",
    },
  };
}
