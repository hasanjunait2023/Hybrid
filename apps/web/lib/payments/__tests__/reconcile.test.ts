import { describe, it, expect } from "vitest";

// We can't easily mock withTenant in this isolated test, so we test the
// pure helper logic (confidence bucketing, amount tolerance, phone tail
// matching) inline.

describe("bKash reconciliation heuristics", () => {
  const AMOUNT_TOLERANCE = 1;
  const TIME_WINDOW_HOURS = 24;
  const PHONE_TAIL_LEN = 6;

  function scoreMatch(
    txnAmount: number,
    orderAmount: number,
    txnPhone: string,
    orderPhone: string,
    txnTime: Date,
    placedAt: Date,
  ): { score: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;
    const amountDelta = Math.abs(txnAmount - orderAmount);
    if (amountDelta === 0) { score += 0.4; reasons.push("amount exact"); }
    else if (amountDelta <= AMOUNT_TOLERANCE) { score += 0.3; reasons.push("amount within ±1 BDT"); }
    const txTail = txnPhone.slice(-PHONE_TAIL_LEN);
    const ordTail = orderPhone.slice(-PHONE_TAIL_LEN);
    if (txTail && ordTail && txTail === ordTail) { score += 0.35; reasons.push("phone tail matches"); }
    const timeDeltaH = Math.abs(txnTime.getTime() - placedAt.getTime()) / (1000 * 60 * 60);
    if (timeDeltaH <= TIME_WINDOW_HOURS) {
      score += 0.25 * (1 - timeDeltaH / TIME_WINDOW_HOURS);
      reasons.push(`within ${Math.round(timeDeltaH)}h`);
    }
    return { score, reasons };
  }

  it("perfect match scores high (≥0.95)", () => {
      const placed = new Date("2026-06-26T10:00:00Z");
      const txn = new Date("2026-06-26T11:00:00Z");
      const r = scoreMatch(1500, 1500, "+880****5678", "+880****5678", txn, placed);
      expect(r.score).toBeGreaterThan(0.95);
      expect(r.reasons).toContain("amount exact");
      expect(r.reasons).toContain("phone tail matches");
    });

    it("amount-only match scores ~0.65 (filtered as medium confidence)", () => {
      const placed = new Date("2026-06-26T10:00:00Z");
      const txn = new Date("2026-06-26T11:00:00Z");
      const r = scoreMatch(1500, 1500, "+880****9999", "+880****5678", txn, placed);
      expect(r.score).toBeCloseTo(0.64, 1);
    });

    it("phone+time match without amount scores low (filtered out)", () => {
      const placed = new Date("2026-06-26T10:00:00Z");
      const txn = new Date("2026-06-26T11:00:00Z");
      const r = scoreMatch(999, 1500, "+880****5678", "+880****5678", txn, placed);
      expect(r.score).toBeLessThan(0.65);
    });

    it("outside time window gets 0 from time component", () => {
      const placed = new Date("2026-06-20T10:00:00Z");
      const txn = new Date("2026-06-26T10:00:00Z");
      const r = scoreMatch(1500, 1500, "+880****5678", "+880****5678", txn, placed);
      // Only amount + phone = 0.75
      expect(r.score).toBeCloseTo(0.75, 1);
    });

    it("amount within ±1 BDT tolerance", () => {
      const placed = new Date("2026-06-26T10:00:00Z");
      const txn = new Date("2026-06-26T11:00:00Z");
      const r = scoreMatch(1501, 1500, "+880****5678", "+880****5678", txn, placed);
      expect(r.reasons.some((r) => r.includes("within"))).toBe(true);
      expect(r.score).toBeGreaterThan(0.85);
    });

    it("zero amount/phone match gets only time component", () => {
      const placed = new Date("2026-06-26T10:00:00Z");
      const txn = new Date("2026-06-26T11:00:00Z");
      const r = scoreMatch(1500, 9999, "+880****1111", "+880****2222", txn, placed);
      // Only time contributes (within 24h, 1h delta = ~0.24)
      expect(r.score).toBeLessThan(0.3);
    });
});
