// Lightweight fixed-window rate limiter over the existing Redis client
// (lib/redis/client.ts). Used to throttle abuse-prone Server Actions (signup,
// checkout) per-IP / per-phone.
//
// Design notes:
//   * Fixed window (INCR + EX on first hit) — cheap, atomic enough for abuse
//     control. Not a precise sliding window; that's intentional (KISS).
//   * Failure mode is per-bucket. Non-auth buckets (e.g. "checkout") FAIL OPEN:
//     a Redis outage must not block real shoppers; the DB / business logic is the
//     real guard there. Auth buckets (login/signup/otp) FAIL CLOSED: an attacker
//     could otherwise knock Redis over to disable the brute-force limiter, so on a
//     limiter error we refuse the request rather than wave it through.
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
  /**
   * On a Redis/limiter error: reject (true) instead of allowing (false, default).
   * Set true for auth-sensitive buckets (login/signup/otp) so an outage can't be
   * used to disable brute-force protection.
   */
  failClosed?: boolean;
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
    // Auth buckets fail CLOSED (reject); everything else fails OPEN (allow).
    return { allowed: !opts.failClosed, count: 0 };
  }
}

// Extract the client IP behind EXACTLY ONE trusted reverse proxy (Caddy in this
// deployment). x-forwarded-for is an APPEND list: each proxy adds the address it
// received the connection from to the RIGHT. The client can forge any number of
// LEFT-most entries, so the only entry we can trust is the RIGHT-most one — the
// hop Caddy itself appended (the real source as Caddy saw it). Taking the
// left-most (the "originating client") would let an attacker rotate
// X-Forwarded-For to mint a fresh rate-limit bucket per request.
//
// ASSUMPTION: the app is always reached through one trusted proxy. If the proxy
// topology changes (e.g. an additional CDN in front of Caddy), revisit which
// entry from the right is the trusted hop.
export function clientIpFrom(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((p) => p.trim()).filter(Boolean);
    const rightMost = parts[parts.length - 1];
    if (rightMost) return rightMost;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
