// GET /api/healthz/db
//
// Probes the Postgres connection via withTenant (the only sanctioned runtime
// path) and returns a live/degraded signal. Pair with /api/healthz/redis for
// the platform healthcheck suite.
//
// Response: { status: "ok" | "degraded", latencyMs: number, database: "up" | "down" }
//   - 200: DB reachable, withTenant query returns
//   - 503: DB unreachable (fail-open: app degrades gracefully)
//
// Uses platform admin context (empty tenant) — reads system metadata only,
// never tenant data, so safe to call from any healthcheck source.

import { NextResponse } from "next/server";
import { asPlatformAdmin } from "@hybrid/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const start = performance.now();
  try {
    const result = await asPlatformAdmin(async (tx) => {
      const rows = await tx`select 1 as ok`;
      return rows[0]?.ok === 1;
    });
    if (!result) throw new Error("select 1 returned no rows");
    return NextResponse.json({
      status: "ok",
      database: "up",
      latencyMs: Math.round(performance.now() - start),
    });
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        database: "down",
        latencyMs: Math.round(performance.now() - start),
      },
      { status: 503 },
    );
  }
}