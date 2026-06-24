// COD reconciliation engine (blueprint S-COD-RECON / brief §2.6).
//
// THE differentiator: the seller must believe the numbers more than the courier.
// So money state is NEVER fabricated — collected/remitted come ONLY from the real
// remittance CSV the courier produced; until a shipment is matched to a remittance
// line it stays OWED (cod_status unchanged). Discrepancies are SURFACED, not
// hidden. Unmatched CSV lines are COUNTED for manual review, never dropped.
//
// Algorithm (brief §2.6):
//   1. Ingest  — one cod_remittance batch row, raw CSV + parsed lines in payload.
//   2. Match   — each line -> shipment by normalized consignment_id (fallback
//                order_number), tenant-scoped (RLS + explicit tenant_id).
//   3. Compute — on a match: write cod_collected/cod_remitted/remittance_id, then
//                discrepancy_amount = cod_amount - cod_remitted.
//                zero  -> cod_status 'reconciled', reconciled=true
//                != 0  -> cod_status 'discrepancy' (merchant decides; fees vs loss)
//   4. Report  — unmatched lines counted into cod_remittance.unmatched_count;
//                batch status flips 'pending' -> 'processed'.
//
// Every read/write goes through withTenant (the golden rule). The whole batch
// runs in ONE withTenant transaction so a mid-batch failure rolls back cleanly
// and the batch is never left half-applied.
import { withTenant } from "@hybrid/db";
import type { Tx } from "@hybrid/db";
import type { ParsedLine } from "./parsers/types";

// Phase-2 synchronous cap. Larger files offload to the FastAPI seam (brief §2.6).
export const MAX_REMITTANCE_ROWS = 500;

export type CourierProvider = "steadfast" | "pathao" | "redx" | "paperfly" | "manual";

export interface MatchOutcome {
  rowNumber: number;
  consignmentId: string | null;
  orderNumber: string | null;
  matched: boolean;
  shipmentId: string | null;
  expected: number | null; // shipment.cod_amount
  remitted: number | null; // line.netRemitted written to the shipment
  discrepancy: number | null; // expected - remitted
}

export interface ReconResult {
  remittanceId: string;
  totalLines: number;
  matchedCount: number;
  unmatchedCount: number;
  discrepancyCount: number; // matched rows with non-zero discrepancy
  outcomes: MatchOutcome[];
}

export class TooManyRowsError extends Error {
  constructor(public readonly count: number) {
    super(`REMITTANCE_TOO_MANY_ROWS:${count}`);
    this.name = "TooManyRowsError";
  }
}

interface IngestInput {
  provider: CourierProvider;
  reference: string | null; // courier remittance/invoice id
  remittedAt: Date | null;
  lines: ParsedLine[];
  rawCsv: string; // stored in payload for audit
}

// Match one parsed line to a shipment within the current tenant txn. Primary key
// is the normalized consignment_id; order_number is the documented fallback for
// couriers that omit/format the consignment id differently in CSV vs API.
async function findShipment(
  tx: Tx,
  tenantId: string,
  line: ParsedLine,
): Promise<{ id: string; codAmount: number } | null> {
  if (line.consignmentId) {
    const byCid = await tx<{ id: string; cod_amount: string }[]>`
      select id, cod_amount from shipment
      where tenant_id = ${tenantId} and consignment_id = ${line.consignmentId}
      limit 1
    `;
    if (byCid[0]) return { id: byCid[0].id, codAmount: Number(byCid[0].cod_amount) };
  }
  if (line.orderNumber) {
    const byOrder = await tx<{ id: string; cod_amount: string }[]>`
      select s.id, s.cod_amount
      from shipment s
      join orders o on o.id = s.order_id
      where s.tenant_id = ${tenantId} and o.order_number = ${line.orderNumber}
      limit 1
    `;
    if (byOrder[0]) return { id: byOrder[0].id, codAmount: Number(byOrder[0].cod_amount) };
  }
  return null;
}

// Ingest a parsed remittance file, match every line, compute discrepancies, and
// mark the batch processed. Returns a per-line outcome for the settlements UI.
export async function reconcileRemittance(
  tenantId: string,
  userId: string | null,
  input: IngestInput,
): Promise<ReconResult> {
  if (input.lines.length > MAX_REMITTANCE_ROWS) {
    throw new TooManyRowsError(input.lines.length);
  }

  return withTenant(tenantId, userId, async (tx) => {
    const totalRemitted = input.lines.reduce((sum, l) => sum + (l.netRemitted ?? 0), 0);

    // 1. Ingest — one batch row (status 'pending' until matching completes).
    const batch = await tx<{ id: string }[]>`
      insert into cod_remittance (tenant_id, provider, reference, total_amount, remitted_at, payload, status)
      values (
        ${tenantId},
        ${input.provider}::courier_provider,
        ${input.reference},
        ${totalRemitted},
        ${input.remittedAt},
        ${tx.json({ raw_csv: input.rawCsv, line_count: input.lines.length })},
        'pending'
      )
      returning id
    `;
    const remittanceId = batch[0]!.id;

    const outcomes: MatchOutcome[] = [];
    let matchedCount = 0;
    let unmatchedCount = 0;
    let discrepancyCount = 0;

    // 2-3. Match + compute, per line.
    for (const line of input.lines) {
      const shipment = await findShipment(tx, tenantId, line);
      if (!shipment) {
        unmatchedCount += 1;
        outcomes.push({
          rowNumber: line.rowNumber,
          consignmentId: line.consignmentId,
          orderNumber: line.orderNumber,
          matched: false,
          shipmentId: null,
          expected: null,
          remitted: line.netRemitted,
          discrepancy: null,
        });
        continue;
      }

      const remitted = line.netRemitted;
      // discrepancy = expected - remitted. Null remitted => still owed; treat as
      // a full discrepancy (the whole expected amount is unaccounted for).
      const discrepancy = shipment.codAmount - (remitted ?? 0);
      const isReconciled = remitted != null && discrepancy === 0;
      const newStatus = isReconciled ? "reconciled" : "discrepancy";
      if (!isReconciled) discrepancyCount += 1;

      await tx`
        update shipment
           set cod_collected      = ${line.collectedAmount},
               cod_remitted       = ${remitted},
               remittance_id      = ${remittanceId},
               discrepancy_amount = ${discrepancy},
               reconciled         = ${isReconciled},
               cod_status         = ${newStatus}::cod_status,
               updated_at         = now()
         where id = ${shipment.id} and tenant_id = ${tenantId}
      `;

      matchedCount += 1;
      outcomes.push({
        rowNumber: line.rowNumber,
        consignmentId: line.consignmentId,
        orderNumber: line.orderNumber,
        matched: true,
        shipmentId: shipment.id,
        expected: shipment.codAmount,
        remitted,
        discrepancy,
      });
    }

    // 4. Mark the batch processed with the unmatched tally.
    await tx`
      update cod_remittance
         set status = 'processed', processed_at = now(), unmatched_count = ${unmatchedCount}
       where id = ${remittanceId} and tenant_id = ${tenantId}
    `;

    return {
      remittanceId,
      totalLines: input.lines.length,
      matchedCount,
      unmatchedCount,
      discrepancyCount,
      outcomes,
    };
  });
}
