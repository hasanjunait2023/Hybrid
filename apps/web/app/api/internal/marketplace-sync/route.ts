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

// Copy each sub-order's live fulfillment/payment status from the tenant `orders`
// row into the buyer-visible marketplace_suborder snapshot, so buyer order
// history never has to read tenant `orders`. Matched by the value-link order_id.
async function syncSuborderStatus(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`
      update marketplace_suborder mso
         set status = o.fulfillment_status,
             payment_status = o.payment_status,
             updated_at = now()
        from orders o
       where o.id = mso.order_id
         and o.tenant_id = mso.tenant_id
         and (mso.status is distinct from o.fulfillment_status
              or mso.payment_status is distinct from o.payment_status)
    `;
  });
}

// Saga recovery: finalize parents left 'pending' by a mid-checkout crash (the
// orchestrator normally finalizes them itself). Older than 15 min, derive the
// terminal status from how many sub-orders actually committed.
// Uses a subquery with LEFT JOIN so the count is computed once per order
// instead of twice via correlated subqueries.
async function recoverStalledOrders(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`
      update marketplace_order mo
         set status = case
               when c.cnt = 0 then 'failed'
               when c.cnt < mo.vendor_count then 'partial'
               else 'confirmed' end,
             updated_at = now()
        from (
          select o.id,
                 count(s.marketplace_order_id)::int as cnt
            from marketplace_order o
            left join marketplace_suborder s on s.marketplace_order_id = o.id
           where o.status = 'pending'
             and o.created_at < now() - interval '15 minutes'
           group by o.id
        ) c
       where mo.id = c.id
    `;
  });
}

// Recompute rating rollups from approved reviews in one pass.
async function rollupRatings(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`
      update marketplace_listing ml set
        rating_count = coalesce(sub.cnt, 0),
        rating_avg   = coalesce(sub.avg, 0)
      from (
        select product_id, count(*)::int as cnt, round(avg(rating)::numeric, 2) as avg
          from marketplace_review where status = 'approved'
         group by product_id
      ) sub
      where ml.product_id = sub.product_id
    `;
    // Zero out listings whose last approved review was removed/rejected.
    await tx`
      update marketplace_listing set rating_count = 0, rating_avg = 0
       where rating_count > 0
         and not exists (
           select 1 from marketplace_review r
            where r.product_id = marketplace_listing.product_id
              and r.status = 'approved'
         )
    `;
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const tenantRows = await asPlatformAdmin((tx) =>
    tx<{ id: string }[]>`select id from tenant where status in ('active', 'trial', 'past_due')`,
  );

  // Fan out listing sync across all tenants in parallel; each tenant is isolated.
  const syncResults = await Promise.allSettled(
    tenantRows.map(({ id: tenantId }) => syncMarketplaceListingsForTenant(tenantId)),
  );

  let listings = 0;
  let skipped = 0;
  syncResults.forEach((r, i) => {
    if (r.status === "fulfilled") {
      listings += r.value;
    } else {
      skipped += 1;
      console.error(`[marketplace-sync] tenant ${tenantRows[i]?.id} failed`, r.reason);
    }
  });

  // Run maintenance passes in parallel — they write to different tables (no conflicts).
  await Promise.allSettled([
    rollupRatings().catch((e) => console.error("[marketplace-sync] ratings rollup failed", e)),
    syncSuborderStatus().catch((e) =>
      console.error("[marketplace-sync] suborder status sync failed", e),
    ),
    recoverStalledOrders().catch((e) =>
      console.error("[marketplace-sync] saga recovery failed", e),
    ),
  ]);

  return NextResponse.json({ ok: true, tenants: tenantRows.length, listings, skipped });
}
