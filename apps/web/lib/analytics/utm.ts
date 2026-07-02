// Phase B UTM capture / cookie / read helpers (Hybrid Tracking V2).
//
// Pure module: no DB, no Next, no env. Contains the only logic the storefront
// and the marketing/signup flows need to:
//   * parse a URL's utm_* query parameters (captureUtmFromUrl)
//   * write them to a first-party cookie (storeUtmInCookie)
//   * read them back on a subsequent render (readUtmFromCookie)
//
// The cookie is named `hybrid_utm` (JSON-serialized, 30-day expiry,
// sameSite=Lax, path=/) and is a first-party same-origin cookie. Browsers
// that block third-party cookies still allow it; sameSite=Lax is safe across
// the storefront <-> checkout <-> success-page handoff because they're all
// on the same eTLD+1.
//
// Server-side callers can also write the cookie via `serverSetUtmCookie`
// (used by the marketing/signup action to set it before the redirect to the
// new tenant's admin host). Server reads use the same parse shape — pass
// the raw `Cookie` header.

/** Parsed UTM attribution. All fields are null when absent. */
export interface UtmAttribution {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
}

export const UTM_COOKIE_NAME = "hybrid_utm";
export const UTM_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const UTM_KEYS = ["source", "medium", "campaign", "content", "term"] as const;
type UtmKey = (typeof UTM_KEYS)[number];

const UTM_QUERY_KEYS: Record<UtmKey, string> = {
  source: "utm_source",
  medium: "utm_medium",
  campaign: "utm_campaign",
  content: "utm_content",
  term: "utm_term",
};

/** Empty attribution — the default when no UTM data is present. */
export function emptyUtm(): UtmAttribution {
  return { source: null, medium: null, campaign: null, content: null, term: null };
}

/** Read UTM params from a URL.searchParams (or a string) into our shape. */
export function captureUtmFromUrl(input: URL | URLSearchParams | string): UtmAttribution {
  let params: URLSearchParams;
  if (typeof input === "string") {
    params = new URLSearchParams(input.startsWith("?") ? input.slice(1) : input);
  } else if (input instanceof URL) {
    params = input.searchParams;
  } else {
    params = input;
  }
  const out = emptyUtm();
  for (const k of UTM_KEYS) {
    const raw = params.get(UTM_QUERY_KEYS[k]);
    if (raw) {
      const trimmed = raw.trim();
      if (trimmed) out[k] = trimmed.slice(0, 200); // cap to keep cookie small
    }
  }
  return out;
}

/** Are there any non-null fields? Used to decide whether to write the cookie at all. */
export function hasAnyUtm(utm: UtmAttribution): boolean {
  return UTM_KEYS.some((k) => utm[k] !== null);
}

/** Serialize an attribution for the cookie. Returns null when no fields are set. */
function serializeUtm(utm: UtmAttribution): string | null {
  if (!hasAnyUtm(utm)) return null;
  return JSON.stringify(utm);
}

/** Parse a cookie value back into our shape. Tolerant of bad JSON / missing fields. */
function deserializeUtm(value: string | null | undefined): UtmAttribution {
  if (!value) return emptyUtm();
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Record<string, unknown>;
    const out = emptyUtm();
    for (const k of UTM_KEYS) {
      const v = parsed[k];
      if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 200);
    }
    return out;
  } catch {
    return emptyUtm();
  }
}

// --- Client-side cookie helpers (browser only) ------------------------------
// Guarded by `typeof document !== "undefined"` so the module can be imported
// safely from server code (analytics/purchase.ts reads fbp/fbc from headers
// server-side; we don't want the server import of this file to pull in
// `document`).

/** Browser: write the UTM cookie. */
export function storeUtmInCookie(utm: UtmAttribution): void {
  if (typeof document === "undefined") return;
  const serialized = serializeUtm(utm);
  if (serialized === null) return;
  const value = encodeURIComponent(serialized);
  const parts = [
    `${UTM_COOKIE_NAME}=${value}`,
    `path=/`,
    `max-age=${UTM_COOKIE_MAX_AGE_SECONDS}`,
    `SameSite=Lax`,
  ];
  document.cookie = parts.join("; ");
}

/** Browser: read the UTM cookie (returns the empty shape when missing). */
export function readUtmFromCookie(): UtmAttribution {
  if (typeof document === "undefined") return emptyUtm();
  const all = document.cookie ?? "";
  return parseCookieHeader(all)[UTM_COOKIE_NAME]
    ? deserializeUtm(parseCookieHeader(all)[UTM_COOKIE_NAME])
    : emptyUtm();
}

// --- Cookie header parser (browser or server) -------------------------------
// Lightweight: avoids depending on a `cookie` package. Works on a raw
// `document.cookie` string OR a `Cookie:` header from a request.

/** Parse a cookie string into a name→value map. Last write wins. */
export function parseCookieHeader(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (!name) continue;
    const raw = part.slice(idx + 1).trim();
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      out[name] = raw;
    }
  }
  return out;
}

/** Server: read the UTM attribution from a request's Cookie header. */
export function readUtmFromCookieHeader(cookieHeader: string | null | undefined): UtmAttribution {
  const raw = parseCookieHeader(cookieHeader)[UTM_COOKIE_NAME];
  return deserializeUtm(raw);
}

/** Server: build a Set-Cookie header for the UTM cookie. */
export function serverSetUtmCookie(utm: UtmAttribution, opts?: { domain?: string }): string | null {
  const serialized = serializeUtm(utm);
  if (serialized === null) return null;
  const value = encodeURIComponent(serialized);
  const parts = [
    `${UTM_COOKIE_NAME}=${value}`,
    `Path=/`,
    `Max-Age=${UTM_COOKIE_MAX_AGE_SECONDS}`,
    `SameSite=Lax`,
  ];
  if (opts?.domain) parts.push(`Domain=${opts.domain}`);
  return parts.join("; ");
}
