// ============================================================================
// Marketplace buyer session suite (M2). Exercises the real buyer-session module
// (apps/web/lib/marketplace/session.ts) against the embedded Postgres + the
// in-memory next/headers cookie stub: mint -> resolve -> isolate -> destroy.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin, withBuyer } from "../src/index";
import { __clearCookies, __setCookie } from "./next-headers-stub";
import {
  upsertBuyerByPhone,
  createBuyerSession,
  getBuyerSession,
  destroyBuyerSession,
  BUYER_SESSION_COOKIE,
} from "@/lib/marketplace/session";

const PHONE_A = "+8801711000001";
const PHONE_B = "+8801711000002";

let buyerA = "";
let buyerB = "";

async function makeOrder(buyerId: string): Promise<void> {
  await withBuyer(buyerId, (tx) =>
    tx`
      insert into marketplace_order
        (buyer_id, status, contact_name, contact_phone, ship_division, ship_district, ship_thana, ship_line)
      values
        (${buyerId}, 'confirmed', 'Buyer', '+880170000000', 'Dhaka', 'Dhaka', 'Gulshan', 'Road 1')
    `,
  );
}

describe("Marketplace buyer session", () => {
  beforeAll(async () => {
    __clearCookies();
    await asPlatformAdmin(async (tx) => {
      await tx`delete from marketplace_customer where phone in (${PHONE_A}, ${PHONE_B})`;
    });
    buyerA = await upsertBuyerByPhone(PHONE_A, "Buyer A");
    buyerB = await upsertBuyerByPhone(PHONE_B, "Buyer B");
    await makeOrder(buyerA);
    await makeOrder(buyerB);
  });

  afterAll(async () => {
    __clearCookies();
    // marketplace_order.buyer_id is ON DELETE RESTRICT — remove orders first.
    await asPlatformAdmin(async (tx) => {
      await tx`delete from marketplace_order where buyer_id in (${buyerA}, ${buyerB})`;
      await tx`delete from marketplace_customer where phone in (${PHONE_A}, ${PHONE_B})`;
    });
  });

  it("1. upsert by phone is idempotent (same id on return visit)", async () => {
    const again = await upsertBuyerByPhone(PHONE_A, "Buyer A2");
    expect(again).toBe(buyerA);
  });

  it("2. a minted session cookie resolves back to the buyer", async () => {
    __clearCookies();
    await createBuyerSession(buyerA);
    const session = await getBuyerSession();
    expect(session?.buyerId).toBe(buyerA);
  });

  it("3. the resolved buyer sees only their own order via withBuyer", async () => {
    __clearCookies();
    await createBuyerSession(buyerA);
    const session = await getBuyerSession();
    expect(session).not.toBeNull();

    const own = await withBuyer(session!.buyerId, (tx) =>
      tx<{ buyer_id: string }[]>`select buyer_id from marketplace_order`,
    );
    expect(own.length).toBe(1);
    expect(own[0]?.buyer_id).toBe(buyerA);

    const cross = await withBuyer(session!.buyerId, (tx) =>
      tx<{ n: number }[]>`select count(*)::int as n from marketplace_order where buyer_id = ${buyerB}`,
    );
    expect(cross[0]?.n).toBe(0);
  });

  it("4. destroying the session clears resolution", async () => {
    __clearCookies();
    await createBuyerSession(buyerA);
    expect((await getBuyerSession())?.buyerId).toBe(buyerA);
    await destroyBuyerSession();
    expect(await getBuyerSession()).toBeNull();
  });

  it("5. a forged/unknown cookie resolves to null (fail-closed)", async () => {
    __clearCookies();
    __setCookie(BUYER_SESSION_COOKIE, "not-a-real-token");
    expect(await getBuyerSession()).toBeNull();
  });
});
