import { describe, it, expect } from "vitest";
import { customerRefundSms, type RefundNotificationData } from "../templates";

// O22 — refund SMS template tests. Pure functions, no DB/network needed.

const baseData: RefundNotificationData = {
  storeName: "Acme Store",
  orderNumber: 12345,
  amount: 200,
  method: "bkash",
  payoutReference: null,
};

describe("customerRefundSms", () => {
  it("renders bKash refund with trx id when payout_reference provided", () => {
    const msg = customerRefundSms({ ...baseData, payoutReference: "ABC123XYZ" });
    // Should mention the store, the order (in Bangla numerals per DESIGN §4.4),
    // the amount, bKash, and the trx id.
    expect(msg).toContain("Acme Store");
    expect(msg).toContain("১২৩৪৫"); // orderNumber 12345 → Bangla
    expect(msg).toContain("২০০"); // amount 200 → Bangla
    expect(msg).toContain("বিকাশ");
    expect(msg).toContain("ABC123XYZ");
  });

  it("renders bKash refund WITHOUT trx id when payout_reference is null", () => {
    const msg = customerRefundSms({ ...baseData, payoutReference: null });
    expect(msg).not.toContain("TrxID");
  });

  it("renders Nagad refund with the Nagad label (নগদ)", () => {
    const msg = customerRefundSms({ ...baseData, method: "nagad" });
    expect(msg).toContain("নগদ");
    expect(msg).not.toContain("বিকাশ");
  });

  it("renders cash refund with pickup language (different from mobile money)", () => {
    const msg = customerRefundSms({ ...baseData, method: "cash" });
    // Cash refund copy mentions pickup — distinct copy from bKash/Nagad.
    expect(msg).toMatch(/পরবর্তী অর্ডারে|স্টোর থেকে/);
    // Doesn't mention trxID since it's cash.
    expect(msg).not.toContain("TrxID");
  });

  it("uses Bengali numerals for the order number (DESIGN §4.4)", () => {
    const msg = customerRefundSms({ ...baseData, orderNumber: 42 });
    // 42 → ৪২ in Bangla numerals via toBnDigits
    expect(msg).toContain("৪২");
    expect(msg).not.toMatch(/[^০-৯]42[^০-৯]/); // Latin "42" should NOT appear surrounded by non-Bangla digits
  });

  it("formats amount with the ৳ symbol", () => {
    const msg = customerRefundSms({ ...baseData, amount: 1500 });
    expect(msg).toContain("৳");
  });
});