// ============================================================================
// CRM tasks & follow-ups (Phase R1.2). Proves the tasks data layer: create /
// list (with overdue flag) / status toggle / delete, plus the dashboard summary
// (open / overdue / due-today counts + the most-pressing upcoming feed). Tenant
// isolation is enforced via withTenant; verified by a second tenant seeing none.
// Isolated on a freshly provisioned tenant.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";

process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";

import { provisionTenant, createAppUser } from "../../../apps/web/lib/auth/provision";
import {
  createTask,
  listTasks,
  setTaskStatus,
  deleteTask,
  getTaskSummary,
} from "@/lib/admin/tasks";

const RUN = Date.now().toString(36);
const SLUG = `tasks-${RUN}`;
const EMAIL = `tasks-${RUN}@store.test`;

let tenantId = "";
let userId = "";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from crm_task where tenant_id = ${tenantId}`;
    await tx`delete from tenant where slug = ${SLUG}`;
    await tx`delete from app_user where email = ${EMAIL}`;
  });
}

describe("CRM tasks & follow-ups", () => {
  beforeAll(async () => {
    userId = (await createAppUser({ email: EMAIL, fullName: "Tasks Vendor" })).userId;
    tenantId = (await provisionTenant({ userId, storeName: "Tasks Vendor", slug: SLUG, businessType: "retail" })).tenantId;
  });

  afterAll(cleanup);

  it("1. create + list surfaces tasks with the overdue flag", async () => {
    const overdue = await createTask(tenantId, userId, {
      title: "Call back about RTO",
      priority: "high",
      dueAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    });
    await createTask(tenantId, userId, {
      title: "Confirm COD order",
      dueAt: new Date().toISOString(),
    });
    await createTask(tenantId, userId, { title: "No-due follow up" });

    const open = await listTasks(tenantId, userId, "open");
    expect(open).toHaveLength(3);

    const od = open.find((t) => t.id === overdue.id)!;
    expect(od.overdue).toBe(true);
    expect(od.priority).toBe("high");

    const noDue = open.find((t) => t.title === "No-due follow up")!;
    expect(noDue.overdue).toBe(false);
    expect(noDue.dueAt).toBeNull();
  });

  it("2. summary counts open / overdue / due-today and orders upcoming by urgency", async () => {
    const s = await getTaskSummary(tenantId, userId);
    expect(s.open).toBe(3);
    expect(s.overdue).toBeGreaterThanOrEqual(1);
    expect(s.dueToday).toBeGreaterThanOrEqual(1);
    // The overdue task (earliest due) sorts first in the upcoming feed.
    expect(s.upcoming[0]!.title).toBe("Call back about RTO");
  });

  it("3. mark done removes it from open and stamps completed_at", async () => {
    const open = await listTasks(tenantId, userId, "open");
    const target = open.find((t) => t.title === "No-due follow up")!;
    await setTaskStatus(tenantId, userId, target.id, "done");

    const stillOpen = await listTasks(tenantId, userId, "open");
    expect(stillOpen.find((t) => t.id === target.id)).toBeUndefined();

    const done = await listTasks(tenantId, userId, "done");
    const reopened = done.find((t) => t.id === target.id)!;
    expect(reopened.status).toBe("done");
    expect(reopened.completedAt).not.toBeNull();

    // Reopen clears completed_at.
    await setTaskStatus(tenantId, userId, target.id, "open");
    const back = (await listTasks(tenantId, userId, "open")).find((t) => t.id === target.id)!;
    expect(back.status).toBe("open");
    expect(back.completedAt).toBeNull();
  });

  it("4. delete removes a task", async () => {
    const open = await listTasks(tenantId, userId, "open");
    const target = open.find((t) => t.title === "Confirm COD order")!;
    await deleteTask(tenantId, userId, target.id);
    const after = await listTasks(tenantId, userId, "all");
    expect(after.find((t) => t.id === target.id)).toBeUndefined();
  });

  it("5. RLS — another tenant sees none of these tasks", async () => {
    const otherEmail = `tasks-other-${RUN}@store.test`;
    const other = await createAppUser({ email: otherEmail, fullName: "Other" });
    const otherTenant = await provisionTenant({
      userId: other.userId,
      storeName: "Other Vendor",
      slug: `tasks-other-${RUN}`,
      businessType: "retail",
    });
    const leaked = await listTasks(otherTenant.tenantId, other.userId, "all");
    expect(leaked).toHaveLength(0);
    const s = await getTaskSummary(otherTenant.tenantId, other.userId);
    expect(s.open).toBe(0);
    await asPlatformAdmin(async (tx) => {
      await tx`delete from tenant where id = ${otherTenant.tenantId}`;
      await tx`delete from app_user where email = ${otherEmail}`;
    });
  });
});
