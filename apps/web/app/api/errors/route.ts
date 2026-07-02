// GET /api/_errors
//
// Platform admin dashboard endpoint — surfaces recent error_log rows for
// ops review. Sentry/GlitchTip stand-in until a proper error tracker is set
// up. Returns last N errors with module/level/timestamp/count.
//
// Query params:
//   ?since=2026-07-01T00:00:00Z   — only errors after this time
//   ?module=bkash-callback         — filter by module
//   ?limit=100                     — cap (default 100, max 500)
//
// Response: { errors: [...], totalCount: number, modules: string[] }
// Auth: platform admin only (gated via session role check).

import { NextRequest, NextResponse } from "next/server";
import { asPlatformAdmin } from "@hybrid/db";
import { getPlatformAdmin } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ErrorRow {
  id: string;
  module: string;
  message: string;
  level: string;
  tenant_id: string | null;
  request_id: string | null;
  occurred_at: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Platform-admin ONLY — a plain session is not enough (any tenant user has
  // one); error_log is cross-tenant and read via asPlatformAdmin below.
  const admin = await getPlatformAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const module = url.searchParams.get("module");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 500);

  try {
    const errors = await asPlatformAdmin<ErrorRow[]>(async (tx) => {
      return await tx<ErrorRow[]>`
        select id, module, message, level, tenant_id, request_id, occurred_at
        from error_log
        where (${since}::timestamptz is null or occurred_at >= ${since}::timestamptz)
          and (${module}::text is null or module = ${module})
        order by occurred_at desc
        limit ${limit}
      `;
    });

    const counts = await asPlatformAdmin<{ module: string; count: number }[]>(async (tx) => {
      return await tx<{ module: string; count: number }[]>`
        select module, count(*)::int as count
        from error_log
        where occurred_at > now() - interval '24 hours'
        group by module
        order by count desc
      `;
    });

    return NextResponse.json({
      errors,
      totalCount: errors.length,
      modules: counts.map((c) => `${c.module} (${c.count})`),
    });
  } catch (err) {
    // Log server-side only — Postgres error text can echo query fragments.
    console.error("[api/errors] query failed:", err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}