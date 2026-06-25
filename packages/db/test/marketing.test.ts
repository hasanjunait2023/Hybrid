// ============================================================================
// Marketing broadcast slice (tenant roadmap P2-4). Embedded Postgres,
// app_runtime_login (RLS). Exercises apps/web/lib/admin/marketing.ts.
//
// Proves: audience presets resolve the right customers; createCampaign records
// a draft + recipient count; sendCampaign marks it sent with sent_count (SMS_LIVE
// off in test → live:false, recorded not delivered); cross-tenant RLS.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import {
  resolveAudience,
  createCampaign,
  sendCampaign,
  listCampaigns,
} from "../../../apps/web/lib/admin/marketing";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b";
const OWNER_A = "11111111-1111-1111-1111-111111111001";
const OWNER_B = "11111111-1111-1111-1111-111111111002";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from campaign where tenant_id in (${TENANT_A}, ${TENANT_B})`;
    await tx`delete from customer where tenant_id = ${TENANT_A} and phone like '019900000%'`;
  });
}

describe("marketing broadcast slice (P2-4)", () => {
  beforeAll(async () => {
    await cleanup();
    await asPlatformAdmin(async (tx) => {
      // 2 one-time + 1 repeat (orders_count 3) customer.
      await tx`insert into customer (tenant_id, name, phone, orders_count) values
        (${TENANT_A}, 'C1', '0199000001', 1),
        (${TENANT_A}, 'C2', '0199000002', 1),
        (${TENANT_A}, 'C3', '0199000003', 3)`;
    });
  });

  afterAll(cleanup);

  it("1. audience presets resolve the right customers", async () => {
    const all = await resolveAudience(TENANT_A, OWNER_A, "all");
    const repeat = await resolveAudience(TENANT_A, OWNER_A, "repeat");
    // The seed DB may carry other customers; assert our 3 are reflected.
    expect(all.count).toBeGreaterThanOrEqual(3);
    expect(repeat.count).toBeGreaterThanOrEqual(1);
    expect(all.count).toBeGreaterThanOrEqual(repeat.count);
  });

  it("2. createCampaign records a draft + recipient count", async () => {
    const repeat = await resolveAudience(TENANT_A, OWNER_A, "repeat");
    const { id, recipientCount } = await createCampaign(TENANT_A, OWNER_A, {
      channel: "sms",
      audience: "repeat",
      message: "ঈদ অফার ২০%",
    });
    expect(id).toBeTruthy();
    expect(recipientCount).toBe(repeat.count);

    const list = await listCampaigns(TENANT_A, OWNER_A);
    const row = list.find((c) => c.id === id);
    expect(row?.status).toBe("draft");
    expect(row?.audience).toBe("repeat");
  });

  it("3. sendCampaign marks it sent (SMS_LIVE off → recorded, not delivered)", async () => {
    const { id } = await createCampaign(TENANT_A, OWNER_A, {
      channel: "sms",
      audience: "all",
      message: "নতুন পণ্য এসেছে!",
    });
    const res = await sendCampaign(TENANT_A, OWNER_A, id);
    expect(res.live).toBe(false); // SMS_LIVE not set in test
    expect(res.sent).toBeGreaterThanOrEqual(3);

    const list = await listCampaigns(TENANT_A, OWNER_A);
    const row = list.find((c) => c.id === id);
    expect(row?.status).toBe("sent");
    expect(row?.sentCount).toBe(res.sent);

    // Re-sending a sent campaign is rejected.
    await expect(sendCampaign(TENANT_A, OWNER_A, id)).rejects.toThrow();
  });

  it("4. cross-tenant: tenant B cannot see tenant A's campaigns (RLS)", async () => {
    const { id } = await createCampaign(TENANT_A, OWNER_A, {
      channel: "sms",
      audience: "all",
      message: "A only",
    });
    const listB = await listCampaigns(TENANT_B, OWNER_B);
    expect(listB.find((c) => c.id === id)).toBeUndefined();
  });
});
