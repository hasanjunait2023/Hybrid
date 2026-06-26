// bKash reconciliation engine — matches incoming bKash transactions to
// unpaid orders. Two strategies:
//
//   1. Exact match: trx_id == order.sms_reference (manual SMS-entry order flow)
//   2. Fuzzy match: amount within ±1 BDT of order total AND phone last 6 digits
//      match customer.phone AND within 24h of order placement
//
// Each match returns a confidence score (0–1) so the admin UI can present
// "auto-matched" vs "needs review" buckets.

import { withTenant } from "@hybrid/db";

export interface UnpaidOrder {
  id: string;
  orderNumber: number;
  grandTotal: number;
  placedAt: string;
  customerName: string | null;
  customerPhone: string | null;
  smsReference: string | null;
  daysOld: number;
}

export interface BkashTransaction {
  trxId: string;
  amount: number;
  senderPhone: string;
  receivedAt: string;
  /** raw SMS body — used for diagnostics */
  raw?: string;
}

export type MatchConfidence = "exact" | "high" | "medium" | "low" | "none";

export interface ReconcileMatch {
  transaction: BkashTransaction;
  order: UnpaidOrder | null;
  confidence: MatchConfidence;
  /** 0–1 numeric score */
  score: number;
  reasons: string[];
}

export interface ReconcileResult {
  matches: ReconcileMatch[];
  unmatchedTxns: BkashTransaction[];
  unmatchedOrders: UnpaidOrder[];
  /** total matched amount in BDT */
  matchedAmount: number;
}

const AMOUNT_TOLERANCE = 1; // BDT
const TIME_WINDOW_HOURS = 24;
const PHONE_TAIL_LEN = 6;

/**
 * Run the reconciliation engine. Caller passes the candidate transactions
 * (parsed from bKash statement CSV/SMS or fetched via bKash search API).
 */
export async function reconcileBkashTransactions(
  tenantId: string,
  userId: string,
  transactions: BkashTransaction[],
): Promise<ReconcileResult> {
  // Fetch unpaid orders in the time window — restrict by `created_at` to keep
  // the candidate set small even for high-volume stores.
  const candidates = await withTenant(tenantId, userId, async (tx) => {
    const rows = await tx<
      {
        id: string;
        order_number: string;
        grand_total: string;
        placed_at: string;
        customer_name: string | null;
        customer_phone: string | null;
        sms_reference: string | null;
      }[]
    >`
      select
        id, order_number, grand_total, placed_at,
        customer_name, customer_phone, sms_reference
      from orders
      where payment_status = 'unpaid'
        and placed_at >= (now() at time zone 'Asia/Dhaka') - interval '14 days'
        and grand_total > 0
      order by placed_at desc
    `;
    return rows.map((r) => {
      const placedMs = new Date(r.placed_at).getTime();
      const now = Date.now();
      return {
        id: r.id,
        orderNumber: Number(r.order_number),
        grandTotal: Number(r.grand_total),
        placedAt: r.placed_at,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        smsReference: r.sms_reference,
        daysOld: Math.floor((now - placedMs) / (1000 * 60 * 60 * 24)),
      } satisfies UnpaidOrder;
    });
  });

  // Index candidates by sms_reference for fast exact match.
  const bySmsRef = new Map<string, UnpaidOrder>();
  for (const o of candidates) {
    if (o.smsReference) bySmsRef.set(o.smsReference, o);
  }

  const usedOrderIds = new Set<string>();
  const matches: ReconcileMatch[] = [];

  for (const txn of transactions) {
    // Strategy 1: exact match on trx_id == sms_reference
    const exact = bySmsRef.get(txn.trxId);
    if (exact && !usedOrderIds.has(exact.id)) {
      matches.push({
        transaction: txn,
        order: exact,
        confidence: "exact",
        score: 1.0,
        reasons: ["trx_id matches order.sms_reference"],
      });
      usedOrderIds.add(exact.id);
      continue;
    }

    // Strategy 2: fuzzy — find best candidate matching amount + phone + time.
    const txnTime = new Date(txn.receivedAt).getTime();
    const candidates2 = candidates
      .filter((o) => !usedOrderIds.has(o.id))
      .map((o) => {
        const reasons: string[] = [];
        let score = 0;

        // Amount match (40% weight)
        const amountDelta = Math.abs(txn.amount - o.grandTotal);
        if (amountDelta === 0) {
          score += 0.4;
          reasons.push("amount exact");
        } else if (amountDelta <= AMOUNT_TOLERANCE) {
          score += 0.3;
          reasons.push(`amount within ±${AMOUNT_TOLERANCE} BDT`);
        }

        // Phone tail match (35% weight)
        const txTail = txn.senderPhone.slice(-PHONE_TAIL_LEN);
        const ordTail = (o.customerPhone ?? "").slice(-PHONE_TAIL_LEN);
        if (txTail && ordTail && txTail === ordTail) {
          score += 0.35;
          reasons.push("phone tail matches");
        }

        // Time match (25% weight) — within 24h of order
        const placedMs = new Date(o.placedAt).getTime();
        const timeDeltaH = Math.abs(txnTime - placedMs) / (1000 * 60 * 60);
        if (timeDeltaH <= TIME_WINDOW_HOURS) {
          score += 0.25 * (1 - timeDeltaH / TIME_WINDOW_HOURS);
          reasons.push(`within ${Math.round(timeDeltaH)}h`);
        }

        return { order: o, score, reasons };
      })
      .filter((c) => c.score > 0.4) // minimum confidence floor
      .sort((a, b) => b.score - a.score);

    if (candidates2.length > 0) {
      const best = candidates2[0]!;
      let confidence: MatchConfidence = "low";
      if (best.score >= 0.85) confidence = "high";
      else if (best.score >= 0.65) confidence = "medium";
      matches.push({
        transaction: txn,
        order: best.order,
        confidence,
        score: best.score,
        reasons: best.reasons,
      });
      usedOrderIds.add(best.order.id);
      continue;
    }

    // No match
    matches.push({
      transaction: txn,
      order: null,
      confidence: "none",
      score: 0,
      reasons: ["no candidate order within amount/phone/time window"],
    });
  }

  const unmatchedTxns = matches.filter((m) => m.order === null).map((m) => m.transaction);
  const matchedOrders = new Set(
    matches.filter((m) => m.order !== null).map((m) => m.order!.id),
  );
  const unmatchedOrders = candidates.filter((o) => !matchedOrders.has(o.id));
  const matchedAmount = matches
    .filter((m) => m.confidence !== "none" && m.confidence !== "low")
    .reduce((sum, m) => sum + m.transaction.amount, 0);

  return { matches, unmatchedTxns, unmatchedOrders, matchedAmount };
}
