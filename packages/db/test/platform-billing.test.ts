// ============================================================================
// Platform billing slice (tenant roadmap PP1-A3). Embedded Postgres. Exercises
// apps/web/lib/platform/billing.ts (asPlatformAdmin).
//
// Proves: overview aggregates subs + invoices; extendTrial pushes the period
// forward, returns the sub to trialing, and un-suspends the tenant; markInvoicePaid
// stamps the invoice.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import {
  getBillingOverview,
  listSubscriptions,
  listInvoices,
  extendTrial,
  markInvoicePaid,
} from "../../../apps/web/lib/platform/billing";

const PB_PLAN = "a1000003-0000-0000-0000-0000000a1003";
const PB_TENANT = "a1000004-0000-0000-0000-0000000a1004";
const PB_INVOICE = "a1000005-0000-0000-0000-0000000a1005";
const PRICE = 1500;

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from invoice where tenant_id = ${PB_TENANT}`;
    await tx`delete from subscription where tenant_id = ${PB_TENANT}`;
    await tx`delete from tenant where id = ${PB_TENANT}`;
    await tx`delete from plan where id = ${PB_PLAN}`;
  });
}

describe("platform billing slice (PP1-A3)", () => {
  beforeAll(async () => {
    await cleanup();
    await asPlatformAdmin(async (tx) => {
      await tx`insert into plan (id, code, name, price_bdt, billing_interval)
               values (${PB_PLAN}, 'pb-test', 'PB Test', ${PRICE}, 'monthly')`;
      await tx`insert into tenant (id, name, slug, status, plan_id)
               values (${PB_TENANT}, 'PB Tenant', 'pb-tenant', 'suspended', ${PB_PLAN})`;
      await tx`insert into subscription (tenant_id, plan_id, status, current_period_end)
               values (${PB_TENANT}, ${PB_PLAN}, 'past_due', now() - interval '5 days')`;
      await tx`insert into invoice (id, tenant_id, amount, status, due_at)
               values (${PB_INVOICE}, ${PB_TENANT}, ${PRICE}, 'open', now() - interval '2 days')`;
    });
  });

  afterAll(cleanup);

  it("1. overview aggregates subs + overdue invoices", async () => {
    const o = await getBillingOverview();
    expect(o.pastDue).toBeGreaterThanOrEqual(1);
    expect(o.overdueAmount).toBeGreaterThanOrEqual(PRICE); // our open+past-due invoice
    expect(typeof o.mrr).toBe("number");
  });

  it("2. extendTrial pushes period forward, trialing, un-suspends tenant", async () => {
    await extendTrial(PB_TENANT, 10);
    const rows = await asPlatformAdmin((tx) =>
      tx<{ status: string; period_end: string; tenant_status: string }[]>`
        select s.status::text as status, s.current_period_end as period_end, t.status::text as tenant_status
        from subscription s join tenant t on t.id = s.tenant_id
        where s.tenant_id = ${PB_TENANT}
      `,
    );
    expect(rows[0]!.status).toBe("trialing");
    expect(new Date(rows[0]!.period_end).getTime()).toBeGreaterThan(Date.now());
    expect(rows[0]!.tenant_status).toBe("trial");
  });

  it("3. markInvoicePaid stamps the invoice", async () => {
    await markInvoicePaid(PB_INVOICE);
    const paid = await listInvoices("paid");
    const row = paid.find((i) => i.id === PB_INVOICE);
    expect(row).toBeDefined();
    expect(row!.paidAt).not.toBeNull();
  });

  it("4. listSubscriptions includes the tenant", async () => {
    const subs = await listSubscriptions();
    expect(subs.find((s) => s.tenantId === PB_TENANT)).toBeDefined();
  });
});
