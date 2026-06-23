// Courier status sync cron (blueprint S-COURIER-WIRE 1.8; research brief §2).
//
// CRON_SECRET-guarded internal route. Polls Steadfast for every active shipment
// and reconciles shipment.status + orders.fulfillment_status from the live
// delivery_status via mapSteadfastStatus. When a parcel is delivered it stamps
// delivered_at and records cod_collected = the expected COD (the courier
// collected the cash on hand-over) with cod_status 'collected'.
//
// Cross-tenant enumeration uses asPlatformAdmin (active shipments span tenants);
// each tenant's reconciliation then runs under its own withTenant context.
//
// Degrades cleanly: a tenant with no enabled/sealed courier_account is SKIPPED
// (logged, not failed) — live Steadfast verification is deferred until merchant
// creds exist (brief §2: no sandbox). One bad tenant never aborts the sweep.
import { NextResponse } from "next/server";
import { asPlatformAdmin, withTenant } from "@hybrid/db";
import { getSteadfastProvider, readSteadfastCreds } from "@/lib/couriers/steadfast";
import { syncTenantShipments } from "@/lib/couriers/sync";

export const dynamic = "force-dynamic";

// Constant-time-ish bearer check. CRON_SECRET must be present (fail-fast) so an
// unset secret can't leave the route open.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Enumerate tenants that have at least one non-terminal shipment.
  const tenantRows = await asPlatformAdmin((tx) =>
    tx<{ tenant_id: string }[]>`
      select distinct tenant_id from shipment
      where provider = 'steadfast'
        and status not in ('delivered', 'returned', 'cancelled')
    `,
  );

  const provider = getSteadfastProvider();
  let synced = 0;
  let skipped = 0;

  for (const { tenant_id: tenantId } of tenantRows) {
    try {
      const creds = await withTenant(tenantId, null, (tx) => readSteadfastCreds(tx));
      if (!creds) {
        // No live creds yet — deferred, not a failure.
        skipped += 1;
        console.warn(`[courier-sync] skip tenant ${tenantId}: courier not configured`);
        continue;
      }
      const n = await syncTenantShipments(tenantId, provider, creds);
      synced += n;
    } catch (error) {
      // One tenant's outage never aborts the sweep.
      skipped += 1;
      console.error(`[courier-sync] tenant ${tenantId} failed`, error);
    }
  }

  return NextResponse.json({ ok: true, tenants: tenantRows.length, synced, skipped });
}
