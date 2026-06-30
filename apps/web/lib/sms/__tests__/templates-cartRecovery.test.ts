// O16 cart-recovery template test. Locks the customer-facing Bengali
// copy for the 3 nudges (1h / 24h / 72h) so a copy edit doesn't slip
// through unnoticed.
import { describe, it, expect } from "vitest";
import { customerCartRecoverySms } from "@/lib/sms/templates";

const baseInput = {
  storeName: "স্টোর A",
  cartTotal: 1500,
  itemCount: 2,
  recoveryUrl: "https://store-a.hybrid.ecomex.cloud/cart/recover/abc123",
};

describe("O16 customerCartRecoverySms", () => {
  it("attempt 1 = soft nudge, includes cart total and recovery link", () => {
    const msg = customerCartRecoverySms({ ...baseInput, attempt: 1 });
    expect(msg).toContain("স্টোর A");
    expect(msg).toContain("২টি পণ্য");
    expect(msg).toContain(baseInput.recoveryUrl);
    expect(msg).toContain("অর্ডার সম্পূর্ণ করুন");
  });

  it("attempt 2 = stock-urgency nudge, mentions limited stock", () => {
    const msg = customerCartRecoverySms({ ...baseInput, attempt: 2 });
    expect(msg).toContain("স্টক সীমিত");
    expect(msg).toContain(baseInput.recoveryUrl);
  });

  it("attempt 3 = last-chance, ends with 'আজ রাতের মধ্যে'", () => {
    const msg = customerCartRecoverySms({ ...baseInput, attempt: 3 });
    expect(msg).toContain("শেষ সুযোগ");
    expect(msg).toContain("আজ রাতের মধ্যে");
  });

  it("singular item count uses ১টি পণ্য", () => {
    const msg = customerCartRecoverySms({ ...baseInput, itemCount: 1, attempt: 1 });
    expect(msg).toContain("১টি পণ্য");
    expect(msg).not.toContain("১টি পণ্যগুলি"); // no double-plural
  });
});
