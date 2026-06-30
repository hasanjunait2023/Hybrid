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
  // O7 — NDR (Non-Delivery Report) detection. When the courier returns
  // 'cancelled' or 'returned' (i.e. the parcel is coming back without
  // delivery), stamp ndr_at + ndr_count + ndr_reason so the admin can
  // see the failure mode and decide between re-attempt / RTS / refund.
  // We extract the reason from the raw payload when the courier includes
  // it (Steadfast puts it on the `reason` / `cancellation_reason` field);
  // otherwise we fall back to 'other' and the admin can amend it.
  const isNdr = status.status === "cancelled" || status.status === "returned";
  const ndrReason = isNdr ? extractNdrReason(status.raw) : null;

  await withTenant(tenantId, null, async (tx) => {
    // Delivery stamps delivered_at + the delivered status only. cod_status stays
    // 'pending' and cod_collected is NOT written — the COD is still owed until a
    // remittance reconciliation confirms the courier paid the seller.
    await tx`
      update shipment
         set status = ${status.status}::shipment_status,
             raw_status = ${typeof status.raw === "object" ? JSON.stringify(status.raw) : String(status.raw)},
             delivered_at = ${delivered ? new Date() : null},
             ndr_at = ${isNdr ? new Date() : null},
             ndr_reason = ${ndrReason},
             ndr_count = case when ${isNdr} then ndr_count + 1 else ndr_count end,
             updated_at = now()
       where id = ${shipment.id}
    `;
    await tx`
      update orders
         set fulfillment_status = ${status.fulfillment}::order_fulfillment_status,
             updated_at = now()
       where id = ${shipment.orderId}
    `;
    // O7 — when the first NDR lands, write an admin-visible note so the
    // order detail timeline shows what happened without admin having to
    // dig into the courier dashboard. author_id is NULL for system notes
    // (the only column the schema offers; the system vs human distinction
    // is encoded in the note body itself).
    if (isNdr) {
      const noteBody = `NDR (Non-Delivery Report): ${ndrReason ?? "other"} — parcel returned by courier`;
      await tx`
        insert into order_note (tenant_id, order_id, author_id, body)
        values (${tenantId}, ${shipment.orderId}, null, ${noteBody})
      `;
    }
  });
}

// Map a raw courier payload to one of our NDR reason tags. The vocabulary
// is intentionally narrow (see the CHECK in 35_o7_ndr.sql); unmapped values
// fall through to 'other' so the admin can amend.
function extractNdrReason(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "other";
  const obj = raw as Record<string, unknown>;
  // Steadfast puts the reason in `reason`, `cancellation_reason`,
  // `delivery_failure_reason`, or `note` — be permissive.
  const candidates = [
    obj.reason,
    obj.cancellation_reason,
    obj.delivery_failure_reason,
    obj.note,
  ];
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const lower = c.toLowerCase();
    if (lower.includes("refus") || lower.includes("cancel")) return "customer_refused";
    if (lower.includes("address") || lower.includes("location") || lower.includes("wrong")) return "wrong_address";
    if (lower.includes("phone") || lower.includes("unreachable") || lower.includes("off")) return "phone_off";
    if (lower.includes("unavailable") || lower.includes("not home") || lower.includes("absent")) return "customer_unavailable";
    if (lower.includes("damage")) return "damaged_in_transit";
    if (lower.includes("cod") || lower.includes("not ready")) return "cod_not_ready";
  }
  return "other";
}
