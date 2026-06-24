// Per-tenant courier status reconciliation (blueprint S-COURIER-WIRE 1.8;
// extended for multi-courier in S-PATHAO-WIRE).
//
// Extracted from the cron route so it is testable in isolation: given a tenant
// and a set of courier adapters (real or stubbed) keyed by provider with their
// decrypted creds, poll each active shipment's status, map it to the internal
// status pair, and write the result to shipment + orders inside withTenant.
//
// Delivery handling: when the status maps to 'delivered' we stamp delivered_at
// and move the shipment to 'delivered'. We do NOT assert the cash is in hand:
// delivery only means the parcel reached the customer, not that the courier has
// REMITTED the COD to the seller. So cod_status stays 'pending' (the money is
// still OWED) and cod_collected is left untouched. 'collected'/cod_collected/
// cod_remitted are written ONLY by the remittance reconciliation engine
// (lib/cod/recon.ts) from a real courier CSV — never fabricated by status sync.
// Until a delivered shipment is matched against a remittance, it REMAINS on the
// COD-pending list.
import { withTenant } from "@hybrid/db";
import type { CourierAdapter, CourierCreds, CourierProvider } from "@hybrid/couriers";

interface ActiveShipment {
  id: string;
  orderId: string;
  consignmentId: string;
  provider: string;
  codAmount: number;
}

// A courier adapter bound to its decrypted creds, keyed by provider name. The
// caller supplies only the providers it has configured for this tenant.
export type CourierBindings = Partial<
  Record<CourierProvider, { provider: CourierAdapter; creds: CourierCreds }>
>;

// Reconcile every non-terminal shipment for one tenant across all supplied
// couriers. Returns the number of shipments whose status was polled. Each poll's
// network call runs outside the DB write; the update is applied inside withTenant.
export async function syncTenantShipments(
  tenantId: string,
  bindings: CourierBindings | CourierAdapter,
  creds?: CourierCreds,
): Promise<number> {
  // Backward-compatible overload: an old caller may still pass a single adapter
  // as `bindings` + `creds`. Detect that and adapt to the keyed form (steadfast).
  const resolved = normalizeBindings(bindings, creds);
  const providerNames = Object.keys(resolved) as CourierProvider[];
  if (providerNames.length === 0) return 0;

  const active = await withTenant(tenantId, null, (tx) =>
    tx<
      {
        id: string;
        order_id: string;
        consignment_id: string;
        provider: string;
        cod_amount: string;
      }[]
    >`
      select id, order_id, consignment_id, provider, cod_amount
      from shipment
      where provider = any(${providerNames})
        and consignment_id is not null
        and status not in ('delivered', 'returned', 'cancelled')
    `,
  );

  let count = 0;
  for (const row of active) {
    const binding = resolved[row.provider as CourierProvider];
    if (!binding) continue; // a configured-then-disabled courier; skip cleanly
    const shipment: ActiveShipment = {
      id: row.id,
      orderId: row.order_id,
      consignmentId: row.consignment_id,
      provider: row.provider,
      codAmount: Number(row.cod_amount),
    };
    await reconcileOne(tenantId, binding.provider, binding.creds, shipment);
    count += 1;
  }
  return count;
}

// Accept either the keyed bindings form or the legacy (adapter, creds) pair.
function normalizeBindings(
  bindings: CourierBindings | CourierAdapter,
  creds?: CourierCreds,
): CourierBindings {
  if ("createConsignment" in (bindings as CourierAdapter)) {
    const adapter = bindings as CourierAdapter;
    return { [adapter.provider]: { provider: adapter, creds: creds! } } as CourierBindings;
  }
  return bindings as CourierBindings;
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
    // remittance reconciliation confirms the courier paid the seller.
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
