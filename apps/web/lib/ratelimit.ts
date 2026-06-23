// Lightweight fixed-window rate limiter over the existing Redis client
// (lib/redis/client.ts). Used to throttle abuse-prone Server Actions (signup,
// checkout) per-IP / per-phone.
//
// Design notes:
//   * Fixed window (INCR + EX on first hit) — cheap, atomic enough for abuse
//     control. Not a precise sliding window; that's intentional (KISS).
//   * FAIL-OPEN: if Redis is down we must NOT block real users on an outage, so
//     a cache error is logged once and treated as "allowed". The DB / business
//     logic remains the real guard; this is a front-line dampener only.
import { getCache } from "@/lib/redis/client";

export interface RateLimitResult {
  /** false → caller should refuse the request with a friendly message. */
  allowed: boolean;
  /** Hits recorded in the current window (0 when failing open). */
  count: number;
}

export interface RateLimitOptions {
  /** Stable bucket name, e.g. "signup" or "checkout". Namespaces the key. */
  bucket: string;
  /** Caller-supplied identity (IP, phone, …). */
  identifier: string;
  /** Max allowed hits within the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

// The CacheClient interface exposes get/set/del but not INCR; reach the raw
// ioredis instance only when it's available, else fall back to a get→set
// read-modify-write (good enough for the fail-open dampener). We keep the
// limiter independent of the client's concrete shape.
interface IncrCapable {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

function hasIncr(client: unknown): client is IncrCapable {
  return (
    typeof client === "object" &&
    client !== null &&
    "incr" in client &&
    typeof (client as { incr?: unknown }).incr === "function"
  );
}

let outageLogged = false;
function logOutageOnce(err: unknown): void {
  if (outageLogged) return;
  outageLogged = true;
  console.error("[ratelimit] Redis unavailable — failing open", err);
}

function rlKey(bucket: string, identifier: string): string {
  return `rl:${bucket}:${identifier}`;
}

export async function rateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const key = rlKey(opts.bucket, opts.identifier);
  try {
    const cache = getCache();
    // Prefer atomic INCR when the underlying client exposes it (ioredis does);
    // set the TTL only on the first hit so the window doesn't slide on every call.
    const raw = (cache as { redis?: unknown }).redis;
    if (hasIncr(raw)) {
      const count = await raw.incr(key);
      if (count === 1) await raw.expire(key, opts.windowSeconds);
      return { allowed: count <= opts.limit, count };
    }

    // Fallback path (non-ioredis client): read-modify-write. Slightly racy under
    // concurrency but acceptable for a coarse abuse dampener.
    const current = Number((await cache.get(key)) ?? 0);
    const next = current + 1;
    await cache.set(key, String(next), opts.windowSeconds);
    return { allowed: next <= opts.limit, count: next };
  } catch (err) {
    logOutageOnce(err);
    return { allowed: true, count: 0 };
  }
}

// Extract the client IP the Next way. x-forwarded-for is a comma-separated list
// (client, proxy1, proxy2, …); the first entry is the originating client. Falls
// back to x-real-ip, then a fixed sentinel so a missing header buckets together
// rather than throwing.
export function clientIpFrom(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
