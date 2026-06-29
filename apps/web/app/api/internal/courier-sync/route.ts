// Courier status sync cron (blueprint S-COURIER-WIRE 1.8; research brief §2).
//
// CRON_SECRET-guarded internal route. Polls Steadfast for every active shipment
// and reconciles shipment.status + orders.fulfillment_status from the live
// delivery_status via mapSteadfastStatus. When a parcel is delivered it stamps
// delivered_at and the delivered status; COD stays 'pending' (owed) until a
// remittance reconciliation confirms the courier paid the seller (Phase-2).
//
// Cross-tenant enumeration uses asPlatformAdmin (active shipments span tenants);
// each tenant's reconciliation then runs under its own withTenant context.
//
// Degrades cleanly: a tenant with no enabled/sealed courier_account is SKIPPED
// (logged, not failed) — live Steadfast verification is deferred until merchant
// creds exist (brief §2: no sandbox). One bad tenant never aborts the sweep.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { asPlatformAdmin, withTenant } from "@hybrid/db";
import { getSteadfastProvider, readSteadfastCreds } from "@/lib/couriers/steadfast";
import { syncTenantShipments } from "@/lib/couriers/sync";

export const dynamic = "force-dynamic";

// Constant-time bearer check (mirrors billing-sweep). Fail-closed: a missing
// CRON_SECRET can never leave the route open. Constant-time compare avoids
// leaking the secret via response-timing differences.
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

  // Enumerate tenants that have at least one non-terminal shipment.
  const tenantRows = await asPlatformAdmin((tx) =>
    tx<{ tenant_id: string }[]>`
      select distinct tenant_id from shipment
      where provider = 'steadfast'
        and status not in ('delivered', 'returned', 'cancelled')
    `,
  );

  const provider = getSteadfastProvider();

  const settled = await Promise.allSettled(
    tenantRows.map(async ({ tenant_id: tenantId }) => {
      const creds = await withTenant(tenantId, null, (tx) => readSteadfastCreds(tx));
      if (!creds) {
        console.warn(`[courier-sync] skip tenant ${tenantId}: courier not configured`);
        return { tenantId, synced: 0, skipped: true };
      }
      const n = await syncTenantShipments(tenantId, provider, creds);
      return { tenantId, synced: n, skipped: false };
    }),
  );

  let synced = 0;
  let skipped = 0;
  for (const result of settled) {
    if (result.status === "fulfilled") {
      if (result.value.skipped) skipped += 1;
      else synced += result.value.synced;
    } else {
      skipped += 1;
      console.error(`[courier-sync] tenant failed`, result.reason);
    }
  }

  return NextResponse.json({ ok: true, tenants: tenantRows.length, synced, skipped });
}
