// Per-tenant courier status reconciliation (blueprint S-COURIER-WIRE 1.8).
//
// Extracted from the cron route so it is testable in isolation: given a tenant,
// a courier adapter (real or stubbed) and decrypted creds, poll each active
// shipment's status, map it to the internal status pair, and write the result
// to shipment + orders inside withTenant.
//
// Delivery handling: when mapSteadfastStatus reports 'delivered' we stamp
// delivered_at and move the shipment to 'delivered'. We do NOT assert the cash
// is in hand: delivery only means the parcel reached the customer, not that the
// courier has REMITTED the COD to the seller. So cod_status stays 'pending'
// (the money is still OWED to the seller) and cod_collected is left untouched.
// 'collected'/cod_collected/cod_remitted are reserved for a real remittance
// reconciliation — Phase-2 (brief §2: no Steadfast remittance API yet). Until
// that lands, a delivered COD order REMAINS on the COD-pending list.
import { withTenant } from "@hybrid/db";
import type { CourierAdapter, CourierCreds } from "@hybrid/couriers";

interface ActiveShipment {
  id: string;
  orderId: string;
  consignmentId: string;
  codAmount: number;
}

// Reconcile every non-terminal Steadfast shipment for one tenant. Returns the
// number of shipments whose status was polled. Runs each poll's network call
// outside the DB write, then applies the update inside withTenant.
export async function syncTenantShipments(
  tenantId: string,
  provider: CourierAdapter,
  creds: CourierCreds,
): Promise<number> {
  const active = await withTenant(tenantId, null, (tx) =>
    tx<
      {
        id: string;
        order_id: string;
        consignment_id: string;
        cod_amount: string;
      }[]
    >`
      select id, order_id, consignment_id, cod_amount
      from shipment
      where provider = 'steadfast'
        and consignment_id is not null
        and status not in ('delivered', 'returned', 'cancelled')
    `,
  );

  let count = 0;
  for (const row of active) {
    const shipment: ActiveShipment = {
      id: row.id,
      orderId: row.order_id,
      consignmentId: row.consignment_id,
      codAmount: Number(row.cod_amount),
    };
    await reconcileOne(tenantId, provider, creds, shipment);
    count += 1;
  }
  return count;
}

async function reconcileOne(
  tenantId: string,
  provider: CourierAdapter,
  creds: CourierCreds,
  shipment: ActiveShipment,
): Promise<void> {
  // Live network call (stubbed in tests via the injected adapter).
  const status = await provider.getStatus(shipment.consignmentId, creds);
  const delivered = status.status === "delivered";

  await withTenant(tenantId, null, async (tx) => {
    // Delivery stamps delivered_at + the delivered status only. cod_status stays
    // 'pending' and cod_collected is NOT written — the COD is still owed until a
    // remittance reconciliation (Phase-2) confirms the courier paid the seller.
    await tx`
      update shipment
         set status = ${status.status}::shipment_status,
             raw_status = ${typeof status.raw === "object" ? JSON.stringify(status.raw) : String(status.raw)},
             delivered_at = ${delivered ? new Date() : null},
             updated_at = now()
       where id = ${shipment.id}
    `;
    await tx`
      update orders
         set fulfillment_status = ${status.fulfillment}::order_fulfillment_status,
             updated_at = now()
       where id = ${shipment.orderId}
    `;
  });
}
