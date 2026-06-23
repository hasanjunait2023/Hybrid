// COD-pending data layer (blueprint S-COURIER-WIRE 1.8; DESIGN §P7 honesty).
//
// The "money owed to me" view: shipments whose cash hasn't been collected yet
// (cod_status='pending') with their expected COD totals. This is the seller's
// reconciliation surface — until a courier remittance API exists (brief §2,
// Phase-2), "collected" is set by the delivery sync, and remittance/discrepancy
// stay manual. We show the honest expected total, not a fabricated paid figure.
import { withTenant } from "@hybrid/db";

export interface CodPendingRow {
  shipmentId: string;
  orderId: string;
  orderNumber: number;
  customerName: string | null;
  consignmentId: string | null;
  trackingCode: string | null;
  shipmentStatus: string;
  codAmount: number;
}

export interface CodPendingSummary {
  rows: CodPendingRow[];
  totalExpected: number;
  count: number;
}

export async function getCodPending(
  tenantId: string,
  userId: string,
): Promise<CodPendingSummary> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      {
        shipment_id: string;
        order_id: string;
        order_number: string;
        customer_name: string | null;
        consignment_id: string | null;
        tracking_code: string | null;
        shipment_status: string;
        cod_amount: string;
      }[]
    >`
      select
        s.id as shipment_id, s.order_id, o.order_number, o.customer_name,
        s.consignment_id, s.tracking_code, s.status as shipment_status, s.cod_amount
      from shipment s
      join orders o on o.id = s.order_id
      where s.cod_status = 'pending' and s.cod_amount > 0
      order by o.placed_at desc
      limit 200
    `,
  );

  const mapped = rows.map((r) => ({
    shipmentId: r.shipment_id,
    orderId: r.order_id,
    orderNumber: Number(r.order_number),
    customerName: r.customer_name,
    consignmentId: r.consignment_id,
    trackingCode: r.tracking_code,
    shipmentStatus: r.shipment_status,
    codAmount: Number(r.cod_amount),
  }));

  return {
    rows: mapped,
    totalExpected: mapped.reduce((sum, r) => sum + r.codAmount, 0),
    count: mapped.length,
  };
}
