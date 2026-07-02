import { NextRequest, NextResponse } from "next/server";
import { processRetryQueue } from "@/lib/analytics/retry";

export const dynamic = "force-dynamic";

// POST /api/analytics/retry — background retry worker for failed tracking events.
// Intended to be called by an external scheduler (cron, systemd timer, etc.)
// every 1-2 minutes. The endpoint is intentionally unauthenticated at the app
// layer; protect it at the network edge (Vercel cron secret, internal IP, etc.).
export async function POST(_req: NextRequest): Promise<NextResponse> {
  try {
    const result = await processRetryQueue();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[analytics/retry] worker failed:", error);
    return NextResponse.json({ ok: false, error: "worker failed" }, { status: 500 });
  }
}
