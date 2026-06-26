import { describe, it, expect } from "vitest";
import { smsEncoding, analyzeSms, validateSmsContent } from "../validate";

describe("sms encoding + segments", () => {
  it("Latin = gsm7, Bengali = unicode", () => {
    expect(smsEncoding("Your order is confirmed")).toBe("gsm7");
    expect(smsEncoding("আপনার অর্ডার নিশ্চিত হয়েছে")).toBe("unicode");
    expect(smsEncoding("Order #১২৩")).toBe("unicode"); // Bangla digits force UCS-2
  });

  it("segments at 160 (gsm7) / 70 (unicode)", () => {
    expect(analyzeSms("a".repeat(160)).segments).toBe(1);
    expect(analyzeSms("a".repeat(161)).segments).toBe(2);
    expect(analyzeSms("ক".repeat(70)).segments).toBe(1);
    expect(analyzeSms("ক".repeat(71)).segments).toBe(2);
  });
});

describe("validateSmsContent", () => {
  it("rejects empty", () => {
    expect(validateSmsContent("   ").code).toBe("EMPTY");
  });

  it("rejects over the segment cap", () => {
    const r = validateSmsContent("ক".repeat(300), { maxSegments: 4 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("TOO_LONG");
  });

  it("rejects Banglish when Bengali is required", () => {
    const r = validateSmsContent("Apnar order confirm hoyeche", { requireBengali: true });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("NOT_BENGALI");
  });

  it("accepts proper Bengali (with Latin brand tokens) when Bengali required", () => {
    expect(validateSmsContent("আপনার অর্ডার নিশ্চিত — bKash এ পেমেন্ট করুন", { requireBengali: true }).ok).toBe(true);
  });

  it("accepts plain English when Bengali not required", () => {
    expect(validateSmsContent("Your order is confirmed").ok).toBe(true);
  });
});
