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
import { enqueueStatusSms } from "@/lib/sms/queue";
import type { StatusChangeKind } from "@/lib/sms/templates";

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
// Detects fulfillment status changes before the bulk update so we can enqueue
// buyer SMS notifications for shipped / delivered / cancelled transitions.
async function syncSuborderStatus(): Promise<void> {
  // Snapshot rows that will change — needed to fire targeted SMS after commit.
  const changed = await asPlatformAdmin((tx) =>
    tx<{
      id: string;
      buyer_phone: string;
      vendor_name: string;
      order_number: number;
      grand_total: string;
      old_status: string | null;
      new_status: string;
    }[]>`
      select
        mso.id,
        mo.contact_phone   as buyer_phone,
        mso.vendor_name,
        mso.order_number,
        mso.grand_total,
        mso.status         as old_status,
        o.fulfillment_status as new_status
      from marketplace_suborder mso
      join orders o on o.id = mso.order_id and o.tenant_id = mso.tenant_id
      join marketplace_order mo on mo.id = mso.marketplace_order_id
      where mso.status is distinct from o.fulfillment_status
    `,
  );

  if (changed.length === 0) return;

  // Bulk update — same as before.
  await asPlatformAdmin((tx) => tx`
    update marketplace_suborder mso
       set status = o.fulfillment_status,
           payment_status = o.payment_status,
           updated_at = now()
      from orders o
     where o.id = mso.order_id
       and o.tenant_id = mso.tenant_id
       and (mso.status is distinct from o.fulfillment_status
            or mso.payment_status is distinct from o.payment_status)
  `);

  // Enqueue buyer SMS for buyer-visible status transitions. Fire-and-forget per
  // row — one SMS failure must never block the others.
  const SMS_STATUSES = new Set<string>(["shipped", "delivered", "cancelled"]);
  for (const row of changed) {
    if (!SMS_STATUSES.has(row.new_status)) continue;
    void enqueueStatusSms(
      {
        storeName: row.vendor_name,
        orderNumber: Number(row.order_number),
        total: Number(row.grand_total),
        paymentMethod: "cod",
        customerName: "",
        customerPhone: row.buyer_phone,
        trackingCode: null,
      },
      row.new_status as StatusChangeKind,
    ).catch((err) => {
      console.error(
        `[marketplace-sync] SMS enqueue failed for suborder ${row.id}`,
        err,
      );
    });
  }
}

// Saga recovery: finalize parents left 'pending' by a mid-checkout crash (the
// orchestrator normally finalizes them itself). Older than 15 min, derive the
// terminal status from how many sub-orders actually committed.
async function recoverStalledOrders(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`
      update marketplace_order mo
         set status = case
               when (select count(*) from marketplace_suborder s where s.marketplace_order_id = mo.id) = 0 then 'failed'
               when (select count(*) from marketplace_suborder s where s.marketplace_order_id = mo.id) < mo.vendor_count then 'partial'
               else 'confirmed' end,
             updated_at = now()
       where mo.status = 'pending'
         and mo.created_at < now() - interval '15 minutes'
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
         and product_id not in (select product_id from marketplace_review where status = 'approved')
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
  for (const [label, fn] of [
    ["ratings rollup", rollupRatings],
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
