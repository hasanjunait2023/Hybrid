// Hybrid platform-owned tracking (TRACK-V2-A1 §9-10). Pure server helpers
// for sending the deduped Lead / CompleteRegistration event from Hybrid's own
// marketing/signup/platform surfaces to GA4-MP, Meta CAPI, and TikTok Events
// API. Secrets are env-loaded (HYBRID_GA4_API_SECRET, HYBRID_FB_ACCESS_TOKEN,
// HYBRID_TIKTOK_ACCESS_TOKEN) — never env-published. The public IDs are read
// by PlatformTracker (the client island) directly from NEXT_PUBLIC_HYBRID_*.
//
// senders mirror the per-tenant senders in ./ga4.ts / ./meta-capi.ts /
// ./tiktok.ts so the same payload shape fans out to all three. The helpers
// here are platform-context (no tenant id) and do NOT log to
// tracking_event_log (which is tenant-scoped / RLS-isolated) — they just
// fire the HTTP request. The platform admin can observe reach via the
// upstream platform dashboards.
//
// All env reads are guarded so a missing var degrades to a no-op (the
// platform can run with only some providers configured).
import { randomUUID } from "node:crypto";
import type { PlatformLeadPayload } from "./events";

// ---- Env resolution --------------------------------------------------------
// `null` when unset — a single missing var is not a hard error.

export interface PlatformConfig {
  ga4Id: string | null;
  ga4ApiSecret: string | null;
  fbPixelId: string | null;
  fbAccessToken: string | null;
  tiktokId: string | null;
  tiktokAccessToken: string | null;
  clarityId: string | null;
}

export function getPlatformConfig(): PlatformConfig {
  return {
    ga4Id: process.env.NEXT_PUBLIC_HYBRID_GA4_ID || null,
    ga4ApiSecret: process.env.HYBRID_GA4_API_SECRET || null,
    fbPixelId: process.env.NEXT_PUBLIC_HYBRID_FB_PIXEL_ID || null,
    fbAccessToken: process.env.HYBRID_FB_ACCESS_TOKEN || null,
    tiktokId: process.env.NEXT_PUBLIC_HYBRID_TIKTOK_ID || null,
    tiktokAccessToken: process.env.HYBRID_TIKTOK_ACCESS_TOKEN || null,
    clarityId: process.env.NEXT_PUBLIC_HYBRID_CLARITY_ID || null,
  };
}

function enabled(): boolean {
  // Platform tracking is opt-in: a single master switch prevents the marketing
  // landing page from loading 4 third-party scripts in dev/test unless the
  // founder has explicitly configured the platform env vars AND flipped this
  // on. (Master switch chosen over per-flag so an accidental half-config is
  // safe — the master defaults off and stays off until the platform is wired.)
  return process.env.HYBRID_TRACKING_ENABLED === "true";
}

// ---- GA4 Measurement Protocol ---------------------------------------------
// Platform-context lead. Forwards the email as the user_id when present so
// GA4's signed-in reporting can stitch sessions. No _ga cookie available
// on server (we have no client_id) so GA4 records "(not set)" attribution —
// acceptable for a funnel where the upstream source is the click ref / UTM
// (Phase B will plumb the cookie).
export async function sendPlatformLeadGa4(
  payload: PlatformLeadPayload,
  cfg: PlatformConfig,
): Promise<boolean> {
  if (!enabled()) return false;
  if (!cfg.ga4Id || !cfg.ga4ApiSecret) return false;

  // GA4 event name mirrors the canonical Mixpanel/Amplitude spelling: a new
  // user is "sign_up"; a top-of-funnel form-fill is "generate_lead". Phase A
  // signs up on the same server endpoint, so the dual spelling is
  // `sign_up` (Hybrid maps complete_registration → sign_up).
  const eventName = payload.eventName === "complete_registration" ? "sign_up" : "generate_lead";

  const body = {
    // Synthetic client_id — GA4 still ingests; attribution shows "(not set)".
    client_id: `${Date.now()}.${Math.floor(Math.random() * 1e9)}`,
    user_id: payload.email ? payload.email : undefined,
    events: [
      {
        name: eventName,
        params: {
          method: payload.businessType || undefined,
          // Phase B will read this from the forwarded UTM cookie.
          ...(payload.utm ?? {}),
        },
      },
    ],
  };

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(cfg.ga4Id)}&api_secret=${encodeURIComponent(cfg.ga4ApiSecret)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[platform-analytics] GA4-MP returned ${res.status} (${payload.eventName})`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[platform-analytics] GA4-MP send failed (${payload.eventName}):`, error);
    return false;
  }
}

// ---- Meta CAPI -------------------------------------------------------------
// Hybrid's own Lead / CompleteRegistration event. Standard CAPI v17.0 shape.
// Hashing of email/phone (enhanced match) is Phase B.
export async function sendPlatformLeadMeta(
  payload: PlatformLeadPayload,
  cfg: PlatformConfig,
): Promise<boolean> {
  if (!enabled()) return false;
  if (!cfg.fbPixelId || !cfg.fbAccessToken) return false;

  const eventName = payload.eventName === "complete_registration" ? "CompleteRegistration" : "Lead";

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: payload.eventId,
        action_source: "website",
        event_source_url: "https://hybrid.ecomex.cloud/signup",
        user_data: {
          // Phase B: hash email + phone; for now we pass cleartext and let
          // Meta match by IP / cookies only. The platform admin dashboard
          // still benefits from the (not set) match score.
          ...(payload.email ? { em: [payload.email] } : {}),
        },
        custom_data: {
          content_name: "hybrid_signup",
          business_type: payload.businessType || undefined,
          ...(payload.utm ?? {}),
        },
      },
    ],
  };

  const url = `https://graph.facebook.com/v17.0/${encodeURIComponent(cfg.fbPixelId)}/events?access_token=${encodeURIComponent(cfg.fbAccessToken)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[platform-analytics] Meta CAPI returned ${res.status} (${payload.eventName})`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[platform-analytics] Meta CAPI send failed (${payload.eventName}):`, error);
    return false;
  }
}

// ---- TikTok Events API -----------------------------------------------------
// Same shared event_id as the Meta + GA4 fires for cross-platform dedup.
export async function sendPlatformLeadTikTok(
  payload: PlatformLeadPayload,
  cfg: PlatformConfig,
): Promise<boolean> {
  if (!enabled()) return false;
  if (!cfg.tiktokId || !cfg.tiktokAccessToken) return false;

  const eventName = payload.eventName === "complete_registration" ? "CompleteRegistration" : "SubmitForm";

  const body = {
    pixel_code: cfg.tiktokId,
    event: eventName,
    event_id: payload.eventId,
    timestamp: new Date().toISOString(),
    context: {
      user: { ip: "", user_agent: "" },
      page: { url: "https://hybrid.ecomex.cloud/signup" },
    },
    properties: {
      content_name: "hybrid_signup",
      business_type: payload.businessType || undefined,
      ...(payload.utm ?? {}),
    },
  };

  const url = `https://business-api.tiktok.com/open_api/v1.3/event/track/?access_token=${encodeURIComponent(cfg.tiktokAccessToken)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[platform-analytics] TikTok Events API returned ${res.status} (${payload.eventName})`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[platform-analytics] TikTok Events API send failed (${payload.eventName}):`, error);
    return false;
  }
}

// ---- Top-level fire helper (TRACK-V2-A1 §10) -------------------------------
// Builds the PlatformLeadPayload with a fresh event_id and fans out to all
// three configured providers in parallel. Awaited (not detached) but isolated
// per-provider — a Meta outage doesn't block GA4, a GA4 outage doesn't block
// TikTok. Never throws (signup must succeed even when all three are down).
export async function firePlatformLead(input: {
  email?: string | null;
  businessType?: string | null;
  utm?: Record<string, string> | null;
  eventName?: "lead" | "complete_registration";
}): Promise<void> {
  const cfg = getPlatformConfig();
  // No platform IDs at all → skip the network entirely.
  if (!cfg.ga4Id && !cfg.fbPixelId && !cfg.tiktokId) return;

  const payload: PlatformLeadPayload = {
    eventId: randomUUID(),
    eventName: input.eventName ?? "complete_registration",
    email: input.email ?? null,
    businessType: input.businessType ?? null,
    utm: input.utm ?? null,
  };

  await Promise.allSettled([
    sendPlatformLeadGa4(payload, cfg),
    sendPlatformLeadMeta(payload, cfg),
    sendPlatformLeadTikTok(payload, cfg),
  ]);
}
