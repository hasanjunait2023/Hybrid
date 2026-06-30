// Redis behind a tiny interface so the implementation can swap to Upstash
// (REST) in cloud without touching callers. Local dev uses ioredis -> redis:7.
import Redis from "ioredis";

export interface CacheClient {
  get(key: string): Promise<string | null>;
  // ttlSeconds is required so we never accidentally write a non-expiring key.
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

class IoRedisClient implements CacheClient {
  private readonly redis: Redis;

  constructor(url: string) {
    // lazyConnect: connect on first command, not at construction, so a Redis
    // outage surfaces as a catchable command error (handled in resolve.ts)
    // rather than an unhandled connection error at import time.
    this.redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 });
    // Swallow the connect-time 'error' event so a Redis outage doesn't print
    // "Unhandled error event" spam on the console. Per-command errors still
    // surface through `await` in get/set/del (caught by callers, e.g.
    // resolve.ts degrades to no-cache). Retries are bounded by
    // maxRetriesPerRequest above.
    this.redis.on("error", (err) => {
      // Single-line, low-noise — only first error after a disconnect really
      // matters; ioredis will keep retrying in the background.
      console.warn(
        `[redis] connection error (degraded to no-cache): ${err.message}`,
      );
    });
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, "EX", ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

let singleton: CacheClient | null = null;

export function getCache(): CacheClient {
  if (singleton) return singleton;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set");
  singleton = new IoRedisClient(url);
  return singleton;
}
