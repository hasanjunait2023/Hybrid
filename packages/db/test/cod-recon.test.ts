// ============================================================================
// COD reconciliation + Pathao-wire integration suite (Wave-2: S-COD-RECON +
// S-PATHAO-WIRE). Runs against the SAME ephemeral embedded Postgres as the RLS
// gate (global-setup.ts) as the non-superuser app_runtime_login role (RLS FORCED).
//
// Proves:
//   COD recon:
//     1. 07_phase2.sql columns exist (status/processed_at/unmatched_count).
//     2. Match by consignment_id -> reconciled when remitted == expected.
//     3. Under-remittance -> discrepancy (positive Δ); over -> discrepancy (neg Δ).
//     4. Missing (no CSV line) leaves the shipment OWED — never fabricated.
//     5. Unmatched CSV line counted into cod_remittance.unmatched_count, reported.
//     6. Fallback match by order_number when consignment_id absent.
//     7. CSV parser fail-closed: malformed/short rows reported, not dropped.
//     8. markDiscrepancyResolved flips discrepancy -> reconciled (manual override).
//   Pathao wire:
//     9. sendToCourierCore with the REAL PathaoProvider (fake fetch + Map token
//        store) creates a shipment row with provider='pathao'.
//    10. syncTenantShipments polls Pathao + maps status (delivered) — COD stays OWED.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin, withTenant } from "../src/index";
import type { Tx } from "../src/index";
import { PathaoProvider } from "../../couriers/src/index";
import type { FetchLike, TokenStore, CourierCreds } from "../../couriers/src/index";
import { SteadfastCsvParser } from "../../../apps/web/lib/cod/parsers/steadfast";
import { reconcileRemittance } from "../../../apps/web/lib/cod/recon";
import { getSettlements, markDiscrepancyResolved } from "../../../apps/web/lib/admin/cod";
import { sendToCourierCore } from "../../../apps/web/lib/couriers/send";
import { syncTenantShipments } from "../../../apps/web/lib/couriers/sync";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const OWNER_A = "11111111-1111-1111-1111-111111111001";

// Three orders/shipments: matched, under-remit, and a "delivered no remittance".
const ORD = {
  match: "ca000001-0000-0000-0000-0000000000a1",
  under: "ca000002-0000-0000-0000-0000000000a2",
  missing: "ca000003-0000-0000-0000-0000000000a3",
  pathao: "ca000004-0000-0000-0000-0000000000a4",
};
const SHIP = {
  match: "cb000001-0000-0000-0000-0000000000b1",
  under: "cb000002-0000-0000-0000-0000000000b2",
  missing: "cb000003-0000-0000-0000-0000000000b3",
};
const PROD = "cd000001-0000-0000-0000-0000000000d1";
const VAR = "ce000001-0000-0000-0000-0000000000e1";

function jsonRes(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

// Fake Pathao fetch: issue-token then create order / status info.
function pathaoFetch(orderStatus = "Pending"): FetchLike {
  return async (url: string) => {
    if (url.endsWith("/issue-token")) {
      return jsonRes({ access_token: "tok-abc", expires_in: 18000 });
    }
    if (url.endsWith("/orders")) {
      return jsonRes({ data: { consignment_id: "PATHAO-CID-77", order_status: "Pending" } });
    }
    if (url.includes("/orders/") && url.endsWith("/info")) {
      return jsonRes({ data: { order_status: orderStatus } });
    }
    return jsonRes({ message: "not found" }, false, 404);
  };
}

function mapTokenStore(): TokenStore {
  const m = new Map<string, string>();
  return {
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => void m.set(k, v),
  };
}

const PATHAO_CREDS: CourierCreds = {
  clientId: "cid",
  clientSecret: "csecret",
  username: "u",
  password: "p",
  storeId: "100",
  cityId: "1",
  zoneId: "2",
  areaId: "3",
};

async function insertShipment(
  tx: Tx,
  orderId: string,
  shipmentId: string,
  consignmentId: string | null,
  orderNumber: number,
  codAmount: number,
): Promise<void> {
  await tx`
    insert into orders (
      id, tenant_id, order_number, customer_name, customer_phone,
      shipping_address, subtotal, shipping_total, grand_total, cod_amount,
      payment_status, fulfillment_status, source
    ) values (
      ${orderId}, ${TENANT_A}, ${orderNumber}, 'Karim', '01710000000',
      ${tx.json({ recipient: "Karim", phone: "01710000000", line: "Rd 1" })},
      ${codAmount}, 0, ${codAmount}, ${codAmount}, 'unpaid', 'delivered', 'manual'
    )
  `;
  await tx`
    insert into shipment (id, tenant_id, order_id, provider, consignment_id, status, cod_amount, cod_status)
    values (${shipmentId}, ${TENANT_A}, ${orderId}, 'steadfast', ${consignmentId}, 'delivered', ${codAmount}, 'pending')
  `;
}

async function seed(): Promise<void> {
  if (!process.env.APP_ENCRYPTION_KEY) {
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  }
  await asPlatformAdmin(async (tx) => {
    await cleanup(tx);
    await tx`
      insert into product (id, tenant_id, title, slug, status)
      values (${PROD}, ${TENANT_A}, 'Recon Item', 'recon-item', 'active')
    `;
    await tx`
      insert into product_variant (id, tenant_id, product_id, title, price, inventory_quantity, track_inventory)
      values (${VAR}, ${TENANT_A}, ${PROD}, 'Default', 500, 50, true)
    `;
    await insertShipment(tx, ORD.match, SHIP.match, "CID-1001", 6001, 1000);
    await insertShipment(tx, ORD.under, SHIP.under, "CID-1002", 6002, 1000);
    await insertShipment(tx, ORD.missing, SHIP.missing, "CID-1003", 6003, 1000);
    // Pathao test order: ready to ship (no shipment yet).
    await tx`
      insert into orders (
        id, tenant_id, order_number, customer_name, customer_phone,
        shipping_address, subtotal, shipping_total, grand_total, cod_amount,
        payment_status, fulfillment_status, source
      ) values (
        ${ORD.pathao}, ${TENANT_A}, 6004, 'Jamal', '01712000000',
        ${tx.json({ recipient: "Jamal", phone: "01712000000", line: "Rd 9" })},
        1500, 0, 1500, 1500, 'unpaid', 'packed', 'manual'
      )
    `;
  });
}

async function cleanup(tx: Tx): Promise<void> {
  const orderIds = Object.values(ORD);
  await tx`delete from shipment where order_id = any(${orderIds})`;
  await tx`delete from cod_remittance where tenant_id = ${TENANT_A}`;
  await tx`delete from orders where id = any(${orderIds})`;
  await tx`delete from order_counter where tenant_id = ${TENANT_A}`;
  await tx`delete from product_variant where id = ${VAR}`;
  await tx`delete from product where id = ${PROD}`;
}

describe("COD reconciliation + Pathao wire", () => {
  beforeAll(seed);
  afterAll(async () => {
    await asPlatformAdmin(cleanup);
  });

  it("1. 07_phase2.sql added the batch-state columns to cod_remittance", async () => {
    const cols = await asPlatformAdmin((tx) =>
      tx<{ column_name: string }[]>`
        select column_name from information_schema.columns
        where table_name = 'cod_remittance'
          and column_name in ('status', 'processed_at', 'unmatched_count')
      `,
    );
    expect(cols.map((c) => c.column_name).sort()).toEqual(["processed_at", "status", "unmatched_count"]);
  });

  it("2-5. reconcile a CSV: matched, under-remit discrepancy, unmatched counted", async () => {
    // CID-1001 remits the full 1000 (matched), CID-1002 remits 850 (under-remit
    // discrepancy of +150), CID-9999 matches no shipment (unmatched). CID-1003
    // (the delivered "missing") is deliberately absent from the CSV → stays owed.
    const csv = [
      "Consignment ID,Invoice,Collected Amount,COD Amount",
      "CID-1001,6001,1000,1000",
      "CID-1002,6002,1000,850",
      "CID-9999,9999,500,500",
    ].join("\n");

    const parsed = new SteadfastCsvParser().parse(csv);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.lines).toHaveLength(3);

    const result = await reconcileRemittance(TENANT_A, OWNER_A, {
      provider: "steadfast",
      reference: "BATCH-A",
      remittedAt: new Date(),
      lines: parsed.lines,
      rawCsv: csv,
    });

    expect(result.matchedCount).toBe(2);
    expect(result.unmatchedCount).toBe(1);
    expect(result.discrepancyCount).toBe(1);

    const rows = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ id: string; cod_status: string; cod_remitted: string | null; discrepancy_amount: string; reconciled: boolean }[]>`
        select id, cod_status, cod_remitted, discrepancy_amount, reconciled
        from shipment where order_id = any(${[ORD.match, ORD.under, ORD.missing]})
        order by cod_amount, id
      `,
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

    // matched: reconciled, Δ 0.
    expect(byId[SHIP.match]!.cod_status).toBe("reconciled");
    expect(Number(byId[SHIP.match]!.discrepancy_amount)).toBe(0);
    expect(byId[SHIP.match]!.reconciled).toBe(true);

    // under-remit: discrepancy, Δ = 1000 - 850 = 150.
    expect(byId[SHIP.under]!.cod_status).toBe("discrepancy");
    expect(Number(byId[SHIP.under]!.discrepancy_amount)).toBe(150);
    expect(byId[SHIP.under]!.reconciled).toBe(false);

    // missing: absent from CSV → never touched, still OWED (pending, no remitted).
    expect(byId[SHIP.missing]!.cod_status).toBe("pending");
    expect(byId[SHIP.missing]!.cod_remitted).toBeNull();

    // batch processed + unmatched counted.
    const batch = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ status: string; unmatched_count: number; processed_at: string | null }[]>`
        select status, unmatched_count, processed_at from cod_remittance where reference = 'BATCH-A'
      `,
    );
    expect(batch[0]!.status).toBe("processed");
    expect(Number(batch[0]!.unmatched_count)).toBe(1);
    expect(batch[0]!.processed_at).not.toBeNull();
  });

  it("3b. over-remittance yields a negative discrepancy (still 'discrepancy')", async () => {
    // CID-1003 remits 1200 against an expected 1000 → Δ = -200.
    const csv = ["Consignment ID,Invoice,Collected Amount,COD Amount", "CID-1003,6003,1200,1200"].join("\n");
    const parsed = new SteadfastCsvParser().parse(csv);
    const result = await reconcileRemittance(TENANT_A, OWNER_A, {
      provider: "steadfast",
      reference: "BATCH-OVER",
      remittedAt: new Date(),
      lines: parsed.lines,
      rawCsv: csv,
    });
    expect(result.discrepancyCount).toBe(1);

    const row = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ cod_status: string; discrepancy_amount: string }[]>`
        select cod_status, discrepancy_amount from shipment where id = ${SHIP.missing}
      `,
    );
    expect(row[0]!.cod_status).toBe("discrepancy");
    expect(Number(row[0]!.discrepancy_amount)).toBe(-200);
  });

  it("5b. a duplicate consignment line is counted unmatched, not double-applied", async () => {
    // Reset SHIP.missing to a clean OWED state so this test is self-contained.
    await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx`update shipment set cod_status = 'pending', cod_remitted = null, reconciled = false,
            discrepancy_amount = 0, remittance_id = null where id = ${SHIP.missing}`,
    );
    // Two CSV lines with the SAME consignment_id (CID-1003 → SHIP.missing). The
    // first remits the full 1000 (reconciled). The second is a duplicate: it must
    // NOT re-match — it routes to unmatchedCount and leaves the first write intact.
    const csv = [
      "Consignment ID,Invoice,Collected Amount,COD Amount",
      "CID-1003,6003,1000,1000",
      "CID-1003,6003,1000,777", // duplicate line — different remit; must be ignored
    ].join("\n");
    const parsed = new SteadfastCsvParser().parse(csv);
    expect(parsed.lines).toHaveLength(2);

    const result = await reconcileRemittance(TENANT_A, OWNER_A, {
      provider: "steadfast",
      reference: "BATCH-DUP",
      remittedAt: new Date(),
      lines: parsed.lines,
      rawCsv: csv,
    });

    // First line matched; duplicate routed to unmatched (manual review).
    expect(result.matchedCount).toBe(1);
    expect(result.unmatchedCount).toBe(1);
    expect(result.discrepancyCount).toBe(0);

    // The shipment reflects ONLY the first line (1000 remitted, reconciled) —
    // the duplicate's 777 never overwrote it.
    const row = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ cod_status: string; cod_remitted: string | null; reconciled: boolean }[]>`
        select cod_status, cod_remitted, reconciled from shipment where id = ${SHIP.missing}
      `,
    );
    expect(row[0]!.cod_status).toBe("reconciled");
    expect(Number(row[0]!.cod_remitted)).toBe(1000);
    expect(row[0]!.reconciled).toBe(true);

    // The batch's unmatched tally reflects the rejected duplicate.
    const batch = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ unmatched_count: number }[]>`
        select unmatched_count from cod_remittance where reference = 'BATCH-DUP'
      `,
    );
    expect(Number(batch[0]!.unmatched_count)).toBe(1);
  });

  it("6. fallback match by order_number when consignment_id column is blank", async () => {
    // Reset SHIP.match to pending first, then match by Invoice only.
    await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx`update shipment set cod_status = 'pending', cod_remitted = null, reconciled = false,
            discrepancy_amount = 0, remittance_id = null where id = ${SHIP.match}`,
    );
    const csv = ["Consignment ID,Invoice,Collected Amount,COD Amount", ",6001,1000,1000"].join("\n");
    const parsed = new SteadfastCsvParser().parse(csv);
    expect(parsed.lines[0]!.consignmentId).toBeNull();
    expect(parsed.lines[0]!.orderNumber).toBe("6001");

    const result = await reconcileRemittance(TENANT_A, OWNER_A, {
      provider: "steadfast",
      reference: "BATCH-FALLBACK",
      remittedAt: new Date(),
      lines: parsed.lines,
      rawCsv: csv,
    });
    expect(result.matchedCount).toBe(1);

    const row = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ cod_status: string }[]>`select cod_status from shipment where id = ${SHIP.match}`,
    );
    expect(row[0]!.cod_status).toBe("reconciled");
  });

  it("7. CSV parser is fail-closed: malformed/short rows reported, valid kept", async () => {
    const csv = [
      "Consignment ID,Invoice,Collected Amount,COD Amount",
      "CID-1001,6001,1000,1000", // valid
      "CID-BROKEN,6002,1000", // short row (3 cols, expected 4)
      "CID-2002,6003,notanumber,500", // bad amount
    ].join("\n");
    const parsed = new SteadfastCsvParser().parse(csv);
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.errors.length).toBe(2);
    // Errors name the offending rows — nothing silently dropped.
    expect(parsed.errors.some((e) => e.message.includes("কলাম"))).toBe(true);
  });

  it("7b. missing required consignment column fails the whole file (hard)", async () => {
    const csv = ["Invoice,Amount", "6001,1000"].join("\n");
    const parsed = new SteadfastCsvParser().parse(csv);
    expect(parsed.lines).toHaveLength(0);
    expect(parsed.errors[0]!.message).toContain("Consignment ID");
  });

  it("8. markDiscrepancyResolved flips discrepancy -> reconciled (manual override)", async () => {
    // SHIP.under is in 'discrepancy' from test 2.
    const before = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ cod_status: string }[]>`select cod_status from shipment where id = ${SHIP.under}`,
    );
    expect(before[0]!.cod_status).toBe("discrepancy");

    const ok = await markDiscrepancyResolved(TENANT_A, OWNER_A, SHIP.under);
    expect(ok).toBe(true);

    const after = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ cod_status: string; discrepancy_amount: string; reconciled: boolean }[]>`
        select cod_status, discrepancy_amount, reconciled from shipment where id = ${SHIP.under}
      `,
    );
    expect(after[0]!.cod_status).toBe("reconciled");
    expect(Number(after[0]!.discrepancy_amount)).toBe(0);
    expect(after[0]!.reconciled).toBe(true);

    // A second resolve is a no-op (already reconciled).
    expect(await markDiscrepancyResolved(TENANT_A, OWNER_A, SHIP.under)).toBe(false);
  });

  it("settlements view surfaces the batches + discrepancy summary", async () => {
    const view = await getSettlements(TENANT_A, OWNER_A);
    expect(view.batches.length).toBeGreaterThanOrEqual(1);
    expect(view.summary.expected).toBeGreaterThan(0);
    // Discrepancy rows float to the top of the table (ordered).
    expect(view.rows.length).toBeGreaterThanOrEqual(3);
  });

  it("9. Pathao consignment dispatch creates a shipment with provider='pathao'", async () => {
    const provider = new PathaoProvider({
      fetch: pathaoFetch(),
      tokenStore: mapTokenStore(),
      tokenCacheKey: `pathao:token:${TENANT_A}`,
    });
    const result = await sendToCourierCore(
      TENANT_A,
      OWNER_A,
      ORD.pathao,
      provider,
      async () => PATHAO_CREDS,
      { providerName: "pathao" },
    );
    expect(result.ok).toBe(true);
    expect(result.consignmentId).toBe("PATHAO-CID-77");

    const row = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ provider: string; consignment_id: string; cod_status: string }[]>`
        select provider, consignment_id, cod_status from shipment where order_id = ${ORD.pathao}
      `,
    );
    expect(row[0]!.provider).toBe("pathao");
    expect(row[0]!.consignment_id).toBe("PATHAO-CID-77");
    expect(row[0]!.cod_status).toBe("pending");
  });

  it("10. Pathao status sync maps Delivered; COD stays OWED (never fabricated)", async () => {
    const provider = new PathaoProvider({
      fetch: pathaoFetch("Delivered"),
      tokenStore: mapTokenStore(),
      tokenCacheKey: `pathao:token:${TENANT_A}`,
    });
    const synced = await syncTenantShipments(TENANT_A, {
      pathao: { provider, creds: PATHAO_CREDS },
    });
    expect(synced).toBe(1);

    const row = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ status: string; cod_status: string; cod_collected: string | null; delivered_at: string | null }[]>`
        select status, cod_status, cod_collected, delivered_at from shipment where order_id = ${ORD.pathao}
      `,
    );
    expect(row[0]!.status).toBe("delivered");
    // Delivery != remittance: COD stays owed, nothing fabricated.
    expect(row[0]!.cod_status).toBe("pending");
    expect(row[0]!.cod_collected).toBeNull();
    expect(row[0]!.delivered_at).not.toBeNull();
  });
});
