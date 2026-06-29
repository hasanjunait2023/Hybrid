// ============================================================================
// CRM lead pipeline (Phase R1.3). Proves the lead data layer: create / list by
// stage / advance through the pipeline / convert-to-customer (upsert by phone +
// link) / delete, plus the pipeline summary (per-stage counts + open value).
// Tenant isolation via withTenant, verified by a second tenant seeing none.
// Isolated on a freshly provisioned tenant.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin, withTenant } from "../src/index";

process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";

import { provisionTenant, createAppUser } from "../../../apps/web/lib/auth/provision";
import {
  createLead,
  listLeads,
  setLeadStage,
  convertLead,
  deleteLead,
  getPipelineSummary,
} from "@/lib/admin/leads";

const RUN = Date.now().toString(36);
const SLUG = `leads-${RUN}`;
const EMAIL = `leads-${RUN}@store.test`;
const LEAD_PHONE = "01966000555";

let tenantId = "";
let userId = "";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from crm_lead where tenant_id = ${tenantId}`;
    await tx`delete from customer where tenant_id = ${tenantId}`;
    await tx`delete from tenant where slug = ${SLUG}`;
    await tx`delete from app_user where email = ${EMAIL}`;
  });
}

describe("CRM lead pipeline", () => {
  beforeAll(async () => {
    userId = (await createAppUser({ email: EMAIL, fullName: "Leads Vendor" })).userId;
    tenantId = (await provisionTenant({ userId, storeName: "Leads Vendor", slug: SLUG, businessType: "retail" })).tenantId;
  });

  afterAll(cleanup);

  it("1. create + list by stage, with estimated value", async () => {
    await createLead(tenantId, userId, { name: "FB Inquiry", source: "facebook", estValue: 1500 });
    await createLead(tenantId, userId, { name: "WA Buyer", phone: LEAD_PHONE, source: "whatsapp", estValue: 3000 });

    const all = await listLeads(tenantId, userId, "all");
    expect(all).toHaveLength(2);
    expect(all.every((l) => l.stage === "new")).toBe(true);

    const newOnly = await listLeads(tenantId, userId, "new");
    expect(newOnly).toHaveLength(2);
    const wonOnly = await listLeads(tenantId, userId, "won");
    expect(wonOnly).toHaveLength(0);
  });

  it("2. pipeline summary counts open leads and open value", async () => {
    const s = await getPipelineSummary(tenantId, userId);
    expect(s.openCount).toBe(2);
    expect(s.openValue).toBe(4500);
    const newStage = s.stages.find((x) => x.stage === "new")!;
    expect(newStage.count).toBe(2);
  });

  it("3. advance moves a lead along the pipeline", async () => {
    const leads = await listLeads(tenantId, userId, "new");
    const target = leads.find((l) => l.name === "FB Inquiry")!;
    await setLeadStage(tenantId, userId, target.id, "contacted");
    const contacted = await listLeads(tenantId, userId, "contacted");
    expect(contacted.find((l) => l.id === target.id)).toBeTruthy();
  });

  it("4. convert upserts a customer by phone, links it, and marks the lead won", async () => {
    const leads = await listLeads(tenantId, userId, "all");
    const wa = leads.find((l) => l.name === "WA Buyer")!;
    const res = await convertLead(tenantId, userId, wa.id);
    expect(res.ok).toBe(true);
    expect(res.customerId).toBeTruthy();

    // The lead is now won + linked.
    const won = await listLeads(tenantId, userId, "won");
    const linked = won.find((l) => l.id === wa.id)!;
    expect(linked.customerId).toBe(res.customerId);

    // A real customer exists with that phone.
    const cust = await withTenant(tenantId, userId, (tx) =>
      tx<{ id: string }[]>`select id from customer where phone = ${LEAD_PHONE} limit 1`,
    );
    expect(cust[0]?.id).toBe(res.customerId);
  });

  it("5. convert without a phone is refused", async () => {
    const noPhone = await createLead(tenantId, userId, { name: "No Phone", source: "manual" });
    const res = await convertLead(tenantId, userId, noPhone.id);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("no_phone");
    await deleteLead(tenantId, userId, noPhone.id);
    expect((await listLeads(tenantId, userId, "all")).find((l) => l.id === noPhone.id)).toBeUndefined();
  });

  it("6. RLS — another tenant sees none of these leads", async () => {
    const otherEmail = `leads-other-${RUN}@store.test`;
    const other = await createAppUser({ email: otherEmail, fullName: "Other" });
    const otherTenant = await provisionTenant({
      userId: other.userId,
      storeName: "Other Vendor",
      slug: `leads-other-${RUN}`,
      businessType: "retail",
    });
    const leaked = await listLeads(otherTenant.tenantId, other.userId, "all");
    expect(leaked).toHaveLength(0);
    await asPlatformAdmin(async (tx) => {
      await tx`delete from tenant where id = ${otherTenant.tenantId}`;
      await tx`delete from app_user where email = ${otherEmail}`;
    });
  });
});
