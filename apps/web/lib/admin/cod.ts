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

// ============================================================================
// COD & Settlements view (Phase 2 — S-COD-RECON; DESIGN §Q3).
//
// The reconciliation surface. Every amount is REAL: expected = cod_amount,
// collected = cod_collected, remitted = cod_remitted, discrepancy =
// discrepancy_amount — all written only by the recon engine from a real
// remittance CSV. Nothing here is fabricated; unmatched/owed money stays loud.
// ============================================================================

export interface SettlementRow {
  shipmentId: string;
  orderId: string;
  orderNumber: number;
  customerName: string | null;
  consignmentId: string | null;
  provider: string;
  codStatus: string;
  expected: number;
  collected: number | null;
  remitted: number | null;
  discrepancy: number;
  reconciled: boolean;
  batchReference: string | null;
}

export interface SettlementSummary {
  expected: number; // sum of cod_amount across COD shipments
  collected: number; // sum of cod_collected (real, courier-reported)
  remitted: number; // sum of cod_remitted (real, paid out)
  // Net the courier still owes vs what they remitted. Loud when > 0.
  discrepancy: number;
  discrepancyCount: number; // rows with cod_status='discrepancy'
}

export interface RemittanceBatch {
  id: string;
  provider: string;
  reference: string | null;
  totalAmount: number;
  remittedAt: string | null;
  status: string; // pending | processed | failed
  unmatchedCount: number;
  createdAt: string;
}

export interface SettlementsView {
  summary: SettlementSummary;
  rows: SettlementRow[];
  batches: RemittanceBatch[];
}

// Read the full settlements view for a tenant. One pass over COD-bearing
// shipments (cod_amount > 0) plus the remittance batch list.
export async function getSettlements(
  tenantId: string,
  userId: string,
): Promise<SettlementsView> {
  return withTenant(tenantId, userId, async (tx) => {
    const shipmentRows = await tx<
      {
        shipment_id: string;
        order_id: string;
        order_number: string;
        customer_name: string | null;
        consignment_id: string | null;
        provider: string;
        cod_status: string;
        cod_amount: string;
        cod_collected: string | null;
        cod_remitted: string | null;
        discrepancy_amount: string;
        reconciled: boolean;
        batch_reference: string | null;
      }[]
    >`
      select
        s.id as shipment_id, s.order_id, o.order_number, o.customer_name,
        s.consignment_id, s.provider, s.cod_status, s.cod_amount,
        s.cod_collected, s.cod_remitted, s.discrepancy_amount, s.reconciled,
        r.reference as batch_reference
      from shipment s
      join orders o on o.id = s.order_id
      left join cod_remittance r on r.id = s.remittance_id
      where s.cod_amount > 0
      order by
        case when s.cod_status = 'discrepancy' then 0 else 1 end,
        o.placed_at desc
      limit 500
    `;

    const rows: SettlementRow[] = shipmentRows.map((r) => ({
      shipmentId: r.shipment_id,
      orderId: r.order_id,
      orderNumber: Number(r.order_number),
      customerName: r.customer_name,
      consignmentId: r.consignment_id,
      provider: r.provider,
      codStatus: r.cod_status,
      expected: Number(r.cod_amount),
      collected: r.cod_collected == null ? null : Number(r.cod_collected),
      remitted: r.cod_remitted == null ? null : Number(r.cod_remitted),
      discrepancy: Number(r.discrepancy_amount),
      reconciled: r.reconciled,
      batchReference: r.batch_reference,
    }));

    const summary: SettlementSummary = {
      expected: rows.reduce((s, r) => s + r.expected, 0),
      collected: rows.reduce((s, r) => s + (r.collected ?? 0), 0),
      remitted: rows.reduce((s, r) => s + (r.remitted ?? 0), 0),
      // Net owed = expected - remitted over reconciled/discrepancy rows only
      // (pending rows haven't been remitted yet; counting them would overstate
      // what the courier currently "owes" vs simply hasn't paid out yet).
      discrepancy: rows
        .filter((r) => r.codStatus === "discrepancy" || r.reconciled)
        .reduce((s, r) => s + r.discrepancy, 0),
      discrepancyCount: rows.filter((r) => r.codStatus === "discrepancy").length,
    };

    const batchRows = await tx<
      {
        id: string;
        provider: string;
        reference: string | null;
        total_amount: string;
        remitted_at: string | null;
        status: string;
        unmatched_count: number;
        created_at: string;
      }[]
    >`
      select id, provider, reference, total_amount, remitted_at, status,
             unmatched_count, created_at
      from cod_remittance
      order by created_at desc
      limit 50
    `;

    const batches: RemittanceBatch[] = batchRows.map((b) => ({
      id: b.id,
      provider: b.provider,
      reference: b.reference,
      totalAmount: Number(b.total_amount),
      remittedAt: b.remitted_at,
      status: b.status,
      unmatchedCount: Number(b.unmatched_count),
      createdAt: b.created_at,
    }));

    return { summary, rows, batches };
  });
}

// Manual override: after the seller settles a discrepancy with the courier they
// mark it resolved. We flip cod_status to 'reconciled' and zero the discrepancy
// WITHOUT touching the real collected/remitted figures (audit trail intact).
export async function markDiscrepancyResolved(
  tenantId: string,
  userId: string,
  shipmentId: string,
): Promise<boolean> {
  const updated = await withTenant(tenantId, userId, (tx) =>
    tx<{ id: string }[]>`
      update shipment
         set cod_status = 'reconciled', reconciled = true,
             discrepancy_amount = 0, updated_at = now()
       where id = ${shipmentId} and tenant_id = ${tenantId}
         and cod_status = 'discrepancy'
      returning id
    `,
  );
  return updated.length > 0;
}
