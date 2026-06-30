// Cloudflare Cache Purge (URL-based, Free/Pro/Business compatible).
//
// Wires the storefront HTML cache to the app's revalidateTag scheme. When a
// product / collection / settings changes, bustProductTags() (and friends)
// call this module with the tag list; we translate `tenant:<id>:products`
// into the actual storefront URLs for that tenant and purge by URL on the
// Cloudflare edge.
//
// NO-OP until both CF_API_TOKEN and CF_ZONE_ID are set — safe to import and
// call from any action; it just won't fire. That's intentional so the wire-up
// can ship before the CF cache rules are applied (Boss needs to apply
// infra/cloudflare/cloudflare-cache-setup.sh first; without those rules the
// edge has nothing to purge and the call is harmless).
//
// Free/Pro/Business limit: cache-tag purge needs Enterprise. URL purge is
// universally available, with a quota of 30k URLs/day on Free (we hit well
// under that — ~3 URLs per product edit, low-double-digit edits/day).
//
// No shared structured-log helper exists in lib/, so this file uses plain
// console.* (matching apps/web/lib/sms/notify.ts and similar).

const TAG = "[cache:cf]";

const CF_API_TOKEN = process.env.CF_API_TOKEN ?? "";
const CF_ZONE_ID = process.env.CF_ZONE_ID ?? "";
const PUBLIC_ROOT_DOMAIN =
  process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "hybrid.ecomex.cloud";

interface PurgeResult {
  ok: boolean;
  error?: string;
  urlsPurged: number;
}

/** Whether the purge is wired (env present) — diagnostic only. */
export function cfPurgeConfigured(): boolean {
  return Boolean(CF_API_TOKEN) && Boolean(CF_ZONE_ID);
}

/**
 * Translate cache tags → storefront URLs.
 *
 * Today the only edge-cached surfaces are tenant storefront HTML pages. We
 * enumerate the affected URLs so the CF URL-purge (free-tier compatible) can
 * invalidate them. When Cache-Tag-based purge is wired later (Enterprise),
 * this becomes the tag emitter instead.
 */
function tagsToUrls(tags: readonly string[]): string[] {
  const urls = new Set<string>();
  for (const tag of tags) {
    // tenant:<id>            → storefront home
    // tenant:<id>:products   → /products index
    // tenant:<id>:collections→ /collections index
    // tenant:<id>:product:<pid> → /products/<slug>?  (slug not in tag — see note)
    // tenant:<id>:dashboard  → dashboard (auth-gated, NOT edge-cached; skip)
    const m = tag.match(/^tenant:([0-9a-f-]+)(?::(.+))?$/);
    if (!m) continue;
    const [, tenantId, rest] = m;
    if (!tenantId) continue;
    const host = `${tenantId}.${PUBLIC_ROOT_DOMAIN}`;
    if (!rest) {
      urls.add(`https://${host}/`);
      continue;
    }
    if (rest === "products" || rest === "collections") {
      urls.add(`https://${host}/${rest}`);
      continue;
    }
    // tenant:<id>:product:<pid> — slug isn't in the tag (kept short to avoid
    // GUC bloat). We purge the /products index only; the per-product page
    // self-heals via the short edge TTL once CF cache rules are applied. This
    // is the documented behaviour per SCALING_PREP §A and is acceptable until
    // we wire Cache-Tag purge (Enterprise).
    if (rest.startsWith("product:")) {
      urls.add(`https://${host}/products`);
      continue;
    }
    // dashboard / settings / etc — auth-gated, not edge-cached. Skip.
  }
  return Array.from(urls);
}

/**
 * Purge the given cache tags on the Cloudflare edge. Best-effort, non-
 * blocking on caller — failures are logged, never thrown (the page write
 * itself already succeeded; the worst case is stale edge for up to one
 * edge-TTL window).
 */
export async function purgeCacheTags(
  tags: readonly string[],
): Promise<PurgeResult> {
  if (!cfPurgeConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(TAG, "purge skipped (no env):", tags.length, "tag(s)");
    }
    return { ok: true, urlsPurged: 0 };
  }
  const urls = tagsToUrls(tags);
  if (urls.length === 0) {
    return { ok: true, urlsPurged: 0 };
  }
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ files: urls }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(TAG, `purge failed ${res.status}:`, body.slice(0, 200));
      return {
        ok: false,
        error: `cf ${res.status}: ${body.slice(0, 200)}`,
        urlsPurged: 0,
      };
    }
    console.warn(TAG, `purge ok: ${urls.length} url(s)`);
    return { ok: true, urlsPurged: urls.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(TAG, "purge threw:", msg);
    return { ok: false, error: msg, urlsPurged: 0 };
  }
}
