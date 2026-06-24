/**
 * Next.js custom cache handler backed by Redis (ioredis).
 *
 * Wired via next.config.mjs `cacheHandler` when REDIS_URL is set.
 * Falls back to Next's default in-memory cache when REDIS_URL is absent
 * (local dev / CI / tests) — the guard lives in next.config.mjs, not here.
 *
 * Key design decisions
 * ─────────────────────
 * 1. Tag → keys mapping.
 *    Redis has no native tag index, so we maintain a Redis Set per tag:
 *      hybrid:cache:tag:{tag}  →  Set<cacheKey>
 *    On set() we SADD each tag's set with the cache key.
 *    On revalidateTag() we:
 *      a) SMEMBERS to collect all keys carrying that tag.
 *      b) DEL every data key.
 *      c) DEL the tag set itself (so stale members don't accumulate).
 *
 * 2. Key namespace.
 *    Data keys:    hybrid:cache:data:{cacheKey}
 *    Tag sets:     hybrid:cache:tag:{tag}
 *    Both get a TTL so Redis never fills with orphaned keys.
 *    Tag sets get a longer TTL (CACHE_REVALIDATE_S + 1 day safety margin).
 *
 * 3. TTL source.
 *    The handler receives `ctx.revalidate` (seconds) from Next when present;
 *    otherwise falls back to CACHE_REVALIDATE_S (default 3600 s = 1 h).
 *    A tag set TTL is refreshed on every write.
 *
 * 4. Error isolation.
 *    Every Redis call is try/catch-guarded. On error we:
 *      - get()  → return null  (Next treats as cache miss, re-fetches)
 *      - set()  → no-op        (Next continues without caching)
 *      - revalidateTag() → no-op (stale data may linger — acceptable over crash)
 *    We do NOT throw so a Redis outage never takes down the web process.
 *
 * Compatibility: Next.js 14+ / 15.x  (CacheHandler interface is stable).
 *
 * @see https://nextjs.org/docs/app/api-reference/next-config-js/incrementalCacheHandlerPath
 */

"use strict";

const Redis = require("ioredis");

// ─── Config constants ────────────────────────────────────────────────────────

const NS_DATA = "hybrid:cache:data:";
const NS_TAG  = "hybrid:cache:tag:";

/** Default TTL in seconds for data entries (matches storefront unstable_cache). */
const DEFAULT_TTL_S = parseInt(process.env.CACHE_REVALIDATE_S ?? "3600", 10);

/**
 * Tag-set TTL = data TTL + 1 day.
 * A tag set outliving its data keys is harmless (DEL on a missing key is a
 * no-op). A tag set expiring before its data keys means revalidateTag misses
 * those keys — the safety margin prevents that.
 */
const TAG_TTL_EXTRA_S = 86_400;

// ─── Lazy Redis singleton ────────────────────────────────────────────────────

/** @type {import("ioredis").Redis | null} */
let _redis = null;

function getRedis() {
  if (_redis) return _redis;
  const url = process.env.REDIS_URL;
  if (!url) {
    // Should never reach here when the guard in next.config.mjs works,
    // but be defensive.
    throw new Error("[cache-handler] REDIS_URL is not set");
  }
  _redis = new Redis(url, {
    // Don't open the connection at construction time; open on first command.
    lazyConnect: true,
    // Fail fast rather than queue commands indefinitely during an outage.
    maxRetriesPerRequest: 2,
    // Suppress unhandled-error events (ioredis emits one on connection drop).
    // We catch errors at call-site instead.
    enableOfflineQueue: false,
  });
  _redis.on("error", () => {
    // Swallow connection-level errors; command-level errors are caught below.
  });
  return _redis;
}

// ─── CacheHandler class ──────────────────────────────────────────────────────

class RedisCacheHandler {
  /**
   * Next.js passes the handler options on construction.
   * `options.serverDistDir` is available but we don't need it.
   *
   * @param {object} _options
   */
  // eslint-disable-next-line no-unused-vars
  constructor(_options) {}

  /**
   * Retrieve a cached entry.
   *
   * @param {string} key  — Next.js internal cache key
   * @returns {Promise<{ value: unknown; lastModified: number; tags: string[] } | null>}
   */
  async get(key) {
    try {
      const redis = getRedis();
      const raw = await redis.get(`${NS_DATA}${key}`);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      // Cache miss is safe; Next will re-fetch and re-populate.
      console.error("[cache-handler] get error (cache miss):", err?.message ?? err);
      return null;
    }
  }

  /**
   * Store a cached entry.
   *
   * @param {string}   key
   * @param {unknown}  data   — the value Next.js wants to store
   * @param {object}   ctx
   * @param {number|false|undefined} ctx.revalidate — revalidation interval (s)
   * @param {string[]} [ctx.tags]                  — cache tags attached to this entry
   * @returns {Promise<void>}
   */
  async set(key, data, ctx) {
    try {
      const redis = getRedis();
      const ttl = typeof ctx?.revalidate === "number" ? ctx.revalidate : DEFAULT_TTL_S;

      const entry = JSON.stringify({
        value: data,
        lastModified: Date.now(),
        tags: ctx?.tags ?? [],
      });

      // Write the data entry with TTL.
      await redis.set(`${NS_DATA}${key}`, entry, "EX", ttl);

      // For each tag, add this key to the tag's member set and refresh the
      // tag-set TTL so it outlives the data entry.
      const tags = ctx?.tags ?? [];
      if (tags.length > 0) {
        const tagTtl = ttl + TAG_TTL_EXTRA_S;
        await Promise.all(
          tags.map(async (tag) => {
            const tagKey = `${NS_TAG}${tag}`;
            await redis.sadd(tagKey, key);
            await redis.expire(tagKey, tagTtl);
          }),
        );
      }
    } catch (err) {
      // No-op: entry will simply not be cached; Next re-fetches next request.
      console.error("[cache-handler] set error (cache skip):", err?.message ?? err);
    }
  }

  /**
   * Invalidate all cache entries that carry a given tag.
   * Called by Next.js `revalidateTag(tag)` in Server Actions.
   *
   * @param {string} tag
   * @returns {Promise<void>}
   */
  async revalidateTag(tag) {
    try {
      const redis = getRedis();
      const tagKey = `${NS_TAG}${tag}`;

      // Collect all data-keys that carry this tag.
      const keys = await redis.smembers(tagKey);

      if (keys.length > 0) {
        // DEL all data entries in one round-trip (pipeline).
        const dataKeys = keys.map((k) => `${NS_DATA}${k}`);
        await redis.del(...dataKeys);
      }

      // Remove the tag set itself so stale member names don't accumulate.
      await redis.del(tagKey);
    } catch (err) {
      console.error("[cache-handler] revalidateTag error:", err?.message ?? err);
      // Non-fatal: stale data may persist until it naturally expires (TTL).
    }
  }
}

module.exports = RedisCacheHandler;
