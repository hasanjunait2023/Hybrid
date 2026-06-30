// R7 low-stock template test. Locks the merchant-facing Bengali copy
// so a copy edit doesn't slip through unnoticed.
import { describe, it, expect } from "vitest";
import { merchantLowStockSms } from "@/lib/sms/templates";

describe("R7 merchantLowStockSms", () => {
  it("includes store name, product title, current stock, and threshold", () => {
    const msg = merchantLowStockSms({
      storeName: "স্টোর A",
      productTitle: "A — Cotton Tee",
      currentStock: 2,
      threshold: 5,
    });
    expect(msg).toContain("স্টোর A");
    expect(msg).toContain("A — Cotton Tee");
    expect(msg).toContain("২টি বাকি");
    expect(msg).toContain("থ্রেশহোল্ড ৫");
    expect(msg).toContain("রিস্টক");
  });

  it("renders zero stock as ০টি বাকি", () => {
    const msg = merchantLowStockSms({
      storeName: "X",
      productTitle: "P",
      currentStock: 0,
      threshold: 5,
    });
    expect(msg).toContain("০টি বাকি");
  });
});
