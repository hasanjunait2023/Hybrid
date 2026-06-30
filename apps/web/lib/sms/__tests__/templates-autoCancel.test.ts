// O20 — Auto-cancel customer SMS template tests. Pure functions, no DB/network.

import { describe, it, expect } from "vitest";
import {
  customerOrderAutoCancelledSms,
  type AutoCancelCustomerInput,
} from "../templates";

const baseData: AutoCancelCustomerInput = {
  storeName: "স্টোর A",
  orderNumber: 12,
  hoursOverdue: 49,
};

describe("customerOrderAutoCancelledSms", () => {
  it("renders store name in Bengali", () => {
    const msg = customerOrderAutoCancelledSms(baseData);
    expect(msg).toContain("স্টোর A");
  });

  it("renders order number in Bangla digits", () => {
    const msg = customerOrderAutoCancelledSms(baseData);
    // 12 → ১২ in Bangla numerals via toBnDigits
    expect(msg).toContain("#১২");
  });

  it("renders the hours overdue in Bangla digits", () => {
    const msg = customerOrderAutoCancelledSms(baseData);
    expect(msg).toContain("৪৯");
  });

  it("uses Bengali 'cancelled' wording (বাতিল)", () => {
    const msg = customerOrderAutoCancelledSms(baseData);
    expect(msg).toContain("বাতিল");
  });

  it("renders large order numbers in Bangla digits too", () => {
    const msg = customerOrderAutoCancelledSms({
      storeName: "X",
      orderNumber: 1234567,
      hoursOverdue: 100,
    });
    expect(msg).toContain("#১২৩৪৫৬৭");
    expect(msg).toContain("১০০");
  });

  it("renders hoursOverdue = 1 for almost-immediate auto-cancels", () => {
    const msg = customerOrderAutoCancelledSms({
      storeName: "X",
      orderNumber: 1,
      hoursOverdue: 1,
    });
    expect(msg).toContain("১ ঘণ্টা পর");
  });
});
