// GET /api/healthz/redis
//
// Probes the Redis connection and returns a live/degraded signal. Part of the
// platform healthcheck suite alongside /api/healthz/db (FastAPI).
//
// Response: { status: "ok" | "degraded", latencyMs: number }
//   - 200: Redis is reachable and responds to PING
//   - 503: Redis is unreachable or PING times out (fail-open: app degrades
//     gracefully, but ops should investigate)

import { NextResponse } from "next/server";
import { getCache } from "@/lib/redis/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const start = performance.now();
  try {
    const cache = getCache();
    // The CacheClient interface doesn't expose a raw PING, so we SET+GET a
    // random key as a round-trip probe. This exercises the same code path
    // every other Redis call uses.
    const probe = `healthz:${Date.now()}`;
    await cache.set(probe, "1", 5);
    const got = await cache.get(probe);
    await cache.del(probe);

    if (got !== "1") {
      return NextResponse.json(
        { status: "degraded", latencyMs: Math.round(performance.now() - start) },
        { status: 503 },
      );
    }

    return NextResponse.json({
      status: "ok",
      latencyMs: Math.round(performance.now() - start),
    });
  } catch {
    return NextResponse.json(
      { status: "degraded", latencyMs: Math.round(performance.now() - start) },
      { status: 503 },
    );
  }
}
