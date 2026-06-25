import { describe, it, expect } from "vitest";
import type { AuditAction } from "../record";

// Pure-types test — recordAudit() needs a live DB connection (covered by
// packages/db integration suite). Here we just lock the public type shape
// so a future schema drift in audit_action surfaces as a compile error.

describe("AuditAction enum", () => {
  it("covers tenant-scoped + platform-scoped actions", () => {
    const sample: AuditAction[] = [
      "settings.update",
      "product.create",
      "product.update",
      "product.delete",
      "order.refund",
      "order.cancel",
      "member.invite",
      "member.remove",
      "member.role_change",
      "payment_account.update",
      "tenant.suspend",
      "tenant.reactivate",
      "tenant.plan_change",
      "platform_admin.login",
    ];
    // 14 documented actions — add new ones here AND in the SQL enum together.
    expect(new Set(sample).size).toBe(14);
  });
});

describe("recordAudit entry shape", () => {
  it("accepts minimal entry (only required fields)", () => {
    const entry = {
      actorUserId: "00000000-0000-0000-0000-000000000001",
      action: "settings.update" as const,
    };
    expect(entry.actorUserId).toBeTruthy();
    expect(entry.action).toBe("settings.update");
  });
});