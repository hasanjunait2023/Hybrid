// Render-time guard for seller-controlled URLs (Facebook page, etc.) shown as
// <a href> on the public storefront. Returns the URL only when it parses to an
// http(s) scheme; anything else (javascript:, data:, mailto-as-script, garbage)
// becomes undefined so the anchor renders inert. Defense-in-depth alongside the
// admin-side boundary validation in settings/store/actions.ts.
export function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return url;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
