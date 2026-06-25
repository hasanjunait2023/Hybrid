// Phase 6 — Status-change SMS templates. Buyer-facing, Bengali, no amount in
// the body (status SMS can land on shared phones — keep it private).
import { describe, it, expect } from "vitest";
import {
  customerOrderStatusSms,
  type OrderStatusNotificationData,
} from "../templates";

const baseData: OrderStatusNotificationData = {
  storeName: "স্টোর এ",
  orderNumber: 42,
  total: 1500,
  paymentMethod: "cod",
  customerName: "কাসেম",
  customerPhone: "+8801712345678",
};

describe("customerOrderStatusSms — shipped", () => {
  it("includes store name + Bangla order number + tracking code", () => {
    const sms = customerOrderStatusSms({ ...baseData, trackingCode: "SFT-9876" }, "shipped");
    expect(sms).toContain("স্টোর এ");
    expect(sms).toContain("৪২"); // Bangla digits
    expect(sms).toContain("SFT-9876");
    expect(sms).toContain("পাঠানো হয়েছে");
  });

  it("falls back gracefully when tracking code missing", () => {
    const sms = customerOrderStatusSms(baseData, "shipped");
    expect(sms).toContain("—"); // em-dash placeholder
  });

  it("never includes the order total in the body (privacy)", () => {
    const sms = customerOrderStatusSms({ ...baseData, trackingCode: "SFT-1" }, "shipped");
    expect(sms).not.toContain("1500");
    expect(sms).not.toContain("১৫০০");
  });
});

describe("customerOrderStatusSms — delivered", () => {
  it("uses friendly close", () => {
    const sms = customerOrderStatusSms(baseData, "delivered");
    expect(sms).toContain("ডেলিভারি সম্পন্ন");
    expect(sms).toContain("৪২");
  });
});

describe("customerOrderStatusSms — cancelled", () => {
  it("uses apologetic copy, no amount", () => {
    const sms = customerOrderStatusSms(baseData, "cancelled");
    expect(sms).toContain("বাতিল");
    expect(sms).toContain("৪২");
    expect(sms).not.toContain("1500");
  });
});