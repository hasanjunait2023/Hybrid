// Test-only stub for "@/lib/redis/client". Backs both the rate limiter and the
// tenant-resolve cache with an in-memory store. Exposes an ioredis-shaped
// incr/expire (so lib/ratelimit.ts takes its atomic INCR path) plus the
// CacheClient get/set/del surface used by lib/tenant/resolve.ts.
//
// Values are stored VERBATIM as strings (resolve.ts caches JSON, the limiter
// caches counters) — never coerced, so a JSON cache entry round-trips intact.
export interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  redis: { incr(key: string): Promise<number>; expire(key: string, s: number): Promise<number> };
}

const store = new Map<string, string>();

const client: CacheClient = {
  async get(key: string): Promise<string | null> {
    return store.has(key) ? store.get(key)! : null;
  },
  async set(key: string, value: string): Promise<void> {
    store.set(key, value);
  },
  async del(key: string): Promise<void> {
    store.delete(key);
  },
  redis: {
    async incr(key: string): Promise<number> {
      const next = (Number(store.get(key) ?? 0) || 0) + 1;
      store.set(key, String(next));
      return next;
    },
    async expire(): Promise<number> {
      return 1; // TTL is a no-op in tests; windows are reset via __resetCache.
    },
  },
};

// Mirror the real client's contract: throw when REDIS_URL is unset. Tests that
// pin the DB-fallback path (e.g. resolve.test.ts) delete REDIS_URL and rely on
// getCache() throwing so the cache is bypassed; honoring that keeps those tests
// green. Tests that want the in-memory cache (otp.test.ts) set REDIS_URL.
export function getCache(): CacheClient {
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is not set");
  return client;
}

// Test helper: clear all cache buckets between tests.
export function __resetCache(): void {
  store.clear();
}
