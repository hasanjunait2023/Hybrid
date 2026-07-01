// Redis behind a tiny interface so the implementation can swap to Upstash
// (REST) in cloud without touching callers. Local dev uses ioredis -> redis:7.
import Redis from "ioredis";

export interface CacheClient {
  get(key: string): Promise<string | null>;
  // ttlSeconds is required so we never accidentally write a non-expiring key.
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Set only if key does not exist. Returns true if set, false if already existed. */
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  del(key: string): Promise<void>;
}

class IoRedisClient implements CacheClient {
  private readonly redis: Redis;

  constructor(url: string) {
    // lazyConnect: connect on first command, not at construction, so a Redis
    // outage surfaces as a catchable command error (handled in resolve.ts)
    // rather than an unhandled connection error at import time.
    this.redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      // Fail fast instead of queuing commands during an outage; callers catch.
      enableOfflineQueue: false,
    });
    // Suppress unhandled-error events on connection drop. Command errors surface
    // through the rejected promise on get/set/del — callers handle them there.
    this.redis.on("error", () => {});
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, "EX", ttlSeconds);
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(key, value, "EX", ttlSeconds, "NX");
    return result === "OK";
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
