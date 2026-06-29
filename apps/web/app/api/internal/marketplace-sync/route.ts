// Marketplace reconcile cron (M1; extended in M3). CRON_SECRET-guarded.
//
// The listing projection is normally kept fresh by the admin mutation hook
// (bustProductTags → syncMarketplaceListing). This cron is the SAFETY NET:
//   1. Listing drift/backfill — re-project every live tenant's catalog so any
//      missed hook (fire-and-forget killed, CSV race) self-heals; archived/hidden
//      products get delisted.
//   2. Ratings rollup — recompute marketplace_listing.rating_avg/rating_count
//      from approved reviews.
// (M3 adds: sub-order status sync from tenant orders, and saga recovery for
//  marketplace_order rows stuck in 'pending'.)
//
// Cross-tenant enumeration uses asPlatformAdmin; each tenant's source read runs
// under its own withTenant inside syncMarketplaceListingsForTenant. Degrades
// cleanly: one tenant's failure never aborts the sweep.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { asPlatformAdmin } from "@hybrid/db";
import { syncMarketplaceListingsForTenant } from "@/lib/marketplace/sync";
import {
  rollupRatings,
  backfillMissingSuborders,
  syncSuborderStatus,
  recoverStalledOrders,
} from "@/lib/marketplace/reconcile";

export const dynamic = "force-dynamic";

// Constant-time bearer check (mirrors courier-sync / billing-sweep). Fail-closed.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const tenantRows = await asPlatformAdmin((tx) =>
    tx<{ id: string }[]>`select id from tenant where status in ('active', 'trial', 'past_due')`,
  );

  let listings = 0;
  let skipped = 0;
  for (const { id: tenantId } of tenantRows) {
    try {
      listings += await syncMarketplaceListingsForTenant(tenantId);
    } catch (error) {
      skipped += 1;
      console.error(`[marketplace-sync] tenant ${tenantId} failed`, error);
    }
  }

  // Best-effort maintenance passes (each isolated so one failure never aborts).
  // Order matters: backfill orphaned sub-orders BEFORE status-sync and saga
  // recovery, so recovery sees the real sub-order counts.
  for (const [label, fn] of [
    ["ratings rollup", rollupRatings],
    ["suborder backfill", backfillMissingSuborders],
    ["suborder status sync", syncSuborderStatus],
    ["saga recovery", recoverStalledOrders],
  ] as const) {
    try {
      await fn();
    } catch (error) {
      console.error(`[marketplace-sync] ${label} failed`, error);
    }
  }

  return NextResponse.json({ ok: true, tenants: tenantRows.length, listings, skipped });
}
