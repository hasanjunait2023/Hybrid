// ============================================================================
// Settings + Courier-wire integration suite (Wave-2: S-SETTINGS + S-COURIER-WIRE).
//
// Runs against the SAME ephemeral embedded Postgres as the RLS gate
// (global-setup.ts), as the non-superuser app_runtime_login role (RLS FORCED).
// Imports the settings read helpers + the courier send/sync cores straight from
// apps/web/lib/** — "@hybrid/db" and "@hybrid/couriers" are aliased to their
// package sources in vitest.config.ts so those modules resolve here.
//
// Proves:
//   1. Settings round-trip — bKash creds sealed (sealCredentials) into
//      payment_account; openCredentials recovers the exact plaintext; the
//      read helper (getPaymentSettings) exposes only enabled/configured + a
//      MASKED tail, never the raw secret. The jsonb column is never plaintext.
//   2. Courier creds round-trip — readSteadfastCreds decrypts the sealed
//      courier_account creds; getCourierSettings exposes only a masked hint.
//   3. sendToCourier (STUBBED SteadfastProvider injecting a fake fetch) creates
//      a shipment row + flips orders.fulfillment_status to 'shipped'.
//   4. Double-send is rejected by shipment_consignment_uniq (friendly error).
//   5. courier-sync (stubbed getStatus) reconciles shipment + order; a
//      'delivered' status stamps delivered_at but COD stays OWED — cod_status
//      'pending', cod_collected NOT written (remittance is Phase-2).
//   6. A delivered COD order REMAINS on the COD-pending list (cash still owed
//      until a remittance reconciliation flips it).
//
// Live Steadfast is deferred (no sandbox); the @hybrid/couriers request/response
// CONTRACT is already covered by that package's own tests. Here we use the REAL
// SteadfastProvider with a fake fetch so the wiring + DB writes are exercised
// without a network. No stubs in the wiring itself (real seal/open, real writes).
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin, withTenant, sealCredentials, openCredentials } from "../src/index";
import { SteadfastProvider } from "../../couriers/src/index";
import type { FetchLike } from "../../couriers/src/index";
import { getPaymentSettings, getCourierSettings } from "../../../apps/web/lib/admin/settings";
import { readSteadfastCreds } from "../../../apps/web/lib/couriers/steadfast";
import { sendToCourierCore } from "../../../apps/web/lib/couriers/send";
import { syncTenantShipments } from "../../../apps/web/lib/couriers/sync";
import { getCodPending } from "../../../apps/web/lib/admin/cod";
import { toJsonRecord } from "../../../apps/web/lib/payments/json";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b";
const OWNER_A = "11111111-1111-1111-1111-111111111001";

const ORDER_ID = "9a000001-0000-0000-0000-0000000009a1";
const PROD = "9b000001-0000-0000-0000-0000000009b1";
const VAR = "9c000001-0000-0000-0000-0000000009c1";

// The bKash sandbox creds (brief §1) — load-bearing as a realistic secret.
const BKASH = {
  mode: "sandbox",
  username: "sandboxTokenizedUser02",
  password: "sandboxTokenizedUser02@12345",
  appKey: "4f6o0cjiki2rfm34kfdadl1eqq",
  appSecret: "2is7hdktrekvrbljjh44ll3d9l1dtjo4pasmjvs5vl5qr3fug4b",
};
const STEADFAST = { apiKey: "live-api-key-xyz", secretKey: "live-secret-key-abc" };

// Fake Steadfast fetch — returns the documented create_order / status_by_cid
// shapes so the REAL SteadfastProvider parses them. No network.
function makeFakeFetch(deliveryStatus = "pending"): FetchLike {
  return async (url: string) => {
    if (url.endsWith("/create_order")) {
      return jsonRes({
        status: 200,
        message: "Consignment has been created successfully.",
        consignment: {
          consignment_id: 1424107,
          invoice: "1",
          tracking_code: "TRACK15D7E",
          recipient_name: "Test",
          cod_amount: 1000,
          status: "in_review",
        },
      });
    }
    if (url.includes("/status_by_cid/")) {
      return jsonRes({ status: 200, delivery_status: deliveryStatus });
    }
    return jsonRes({ status: 404, message: "not found" }, false, 404);
  };
}

function jsonRes(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

async function seed(): Promise<void> {
  // crypto needs a key; set it before any seal/open runs.
  if (!process.env.APP_ENCRYPTION_KEY) {
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  }
  await asPlatformAdmin(async (tx) => {
    await cleanup(tx);
    await tx`
      insert into product (id, tenant_id, title, slug, status)
      values (${PROD}, ${TENANT_A}, 'Courier Test Item', 'courier-test-item', 'active')
    `;
    await tx`
      insert into product_variant (id, tenant_id, product_id, title, price, inventory_quantity, track_inventory)
      values (${VAR}, ${TENANT_A}, ${PROD}, 'Default', 500.00, 50, true)
    `;
    // An order ready to ship: COD 1000, structured shipping address.
    await tx`
      insert into orders (
        id, tenant_id, order_number, customer_name, customer_phone,
        shipping_address, subtotal, shipping_total, grand_total, cod_amount,
        payment_status, fulfillment_status, source
      ) values (
        ${ORDER_ID}, ${TENANT_A}, 5001, 'Rahim Uddin', '01711000000',
        ${tx.json({
          recipient: "Rahim Uddin",
          phone: "01711000000",
          division: "Dhaka",
          district: "Dhaka",
          thana: "Mirpur",
          line: "House 9, Road 4",
        })},
        1000, 0, 1000, 1000, 'unpaid', 'packed', 'manual'
      )
    `;
  });
}

async function cleanup(tx: import("../src/index").Tx): Promise<void> {
  await tx`delete from shipment where tenant_id in (${TENANT_A}, ${TENANT_B})`;
  await tx`delete from payment where tenant_id in (${TENANT_A}, ${TENANT_B})`;
  await tx`delete from order_item where order_id = ${ORDER_ID}`;
  await tx`delete from orders where id = ${ORDER_ID}`;
  await tx`delete from order_counter where tenant_id in (${TENANT_A}, ${TENANT_B})`;
  await tx`delete from payment_account where tenant_id in (${TENANT_A}, ${TENANT_B})`;
  await tx`delete from courier_account where tenant_id in (${TENANT_A}, ${TENANT_B})`;
  await tx`delete from product_variant where id = ${VAR}`;
  await tx`delete from product where id = ${PROD}`;
}

// Mirror the saveBkash / saveSteadfast action write path (real sealCredentials +
// upsert). The action modules themselves pull in next/headers (getSession), so
// the data-path write is replicated here exactly as the action performs it.
async function sealBkash(): Promise<void> {
  const sealed = toJsonRecord(sealCredentials(BKASH) as unknown as Record<string, unknown>);
  await withTenant(TENANT_A, OWNER_A, async (tx) => {
    await tx`
      insert into payment_account (tenant_id, provider, is_enabled, credentials)
      values (${TENANT_A}, 'bkash', true, ${tx.json(sealed)})
      on conflict (tenant_id, provider) do update
        set is_enabled = true, credentials = ${tx.json(sealed)}, updated_at = now()
    `;
  });
}

async function sealSteadfast(): Promise<void> {
  const sealed = toJsonRecord(sealCredentials(STEADFAST) as unknown as Record<string, unknown>);
  await withTenant(TENANT_A, OWNER_A, async (tx) => {
    await tx`
      insert into courier_account (tenant_id, provider, is_enabled, credentials)
      values (${TENANT_A}, 'steadfast', true, ${tx.json(sealed)})
      on conflict (tenant_id, provider) do update
        set is_enabled = true, credentials = ${tx.json(sealed)}, updated_at = now()
    `;
  });
}

describe("settings + courier wire", () => {
  beforeAll(seed);
  afterAll(async () => {
    await asPlatformAdmin(cleanup);
  });

  it("1. bKash creds round-trip — sealed in DB, masked in reads, never plaintext", async () => {
    await sealBkash();

    // The jsonb column must NOT contain the plaintext secret.
    const raw = await asPlatformAdmin((tx) =>
      tx<{ credentials: unknown }[]>`
        select credentials from payment_account where tenant_id = ${TENANT_A} and provider = 'bkash'
      `,
    );
    const stored = JSON.stringify(raw[0]!.credentials);
    expect(stored).not.toContain(BKASH.appSecret);
    expect(stored).not.toContain(BKASH.username);

    // openCredentials recovers the exact plaintext.
    const recovered = openCredentials(raw[0]!.credentials as never);
    expect(recovered).toEqual(BKASH);

    // The read helper exposes only enabled/configured + masked hints.
    const settings = await getPaymentSettings(TENANT_A, OWNER_A);
    expect(settings.bkash.enabled).toBe(true);
    expect(settings.bkash.configured).toBe(true);
    expect(settings.bkash.mode).toBe("sandbox");
    // Masked: tail only, raw secret absent from the whole settings object.
    expect(settings.bkash.appKeyHint).toMatch(/^••••/);
    const serialized = JSON.stringify(settings);
    expect(serialized).not.toContain(BKASH.appKey);
    expect(serialized).not.toContain(BKASH.appSecret);
    expect(serialized).not.toContain(BKASH.password);
  });

  it("2. Steadfast creds round-trip — readSteadfastCreds decrypts; read helper masks", async () => {
    await sealSteadfast();

    const creds = await withTenant(TENANT_A, OWNER_A, (tx) => readSteadfastCreds(tx));
    expect(creds).toEqual(STEADFAST);

    const settings = await getCourierSettings(TENANT_A, OWNER_A);
    expect(settings.enabled).toBe(true);
    expect(settings.configured).toBe(true);
    expect(settings.apiKeyHint).toMatch(/^••••/);
    expect(JSON.stringify(settings)).not.toContain(STEADFAST.secretKey);
  });

  it("3. sendToCourier (stubbed provider) creates a shipment + flips order to shipped", async () => {
    const provider = new SteadfastProvider({ fetch: makeFakeFetch() });
    const result = await sendToCourierCore(
      TENANT_A,
      OWNER_A,
      ORDER_ID,
      provider,
      (tx) => readSteadfastCreds(tx),
    );
    expect(result.ok).toBe(true);
    expect(result.consignmentId).toBe("1424107");
    expect(result.trackingCode).toBe("TRACK15D7E");

    const row = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ status: string; cod_amount: string; cod_status: string; fulfillment_status: string }[]>`
        select s.status, s.cod_amount, s.cod_status, o.fulfillment_status
        from shipment s join orders o on o.id = s.order_id
        where s.order_id = ${ORDER_ID}
      `,
    );
    expect(row[0]!.status).toBe("created");
    expect(Number(row[0]!.cod_amount)).toBe(1000);
    expect(row[0]!.cod_status).toBe("pending");
    expect(row[0]!.fulfillment_status).toBe("shipped");
  });

  it("4. double-send is rejected (shipment_consignment_uniq) — friendly error", async () => {
    // Same fake fetch returns the SAME consignment_id → unique violation on the
    // second insert. The 'already has a shipment' guard also fires; both paths
    // must yield ok:false (never a 2nd shipment row).
    const provider = new SteadfastProvider({ fetch: makeFakeFetch() });
    const second = await sendToCourierCore(
      TENANT_A,
      OWNER_A,
      ORDER_ID,
      provider,
      (tx) => readSteadfastCreds(tx),
    );
    expect(second.ok).toBe(false);
    expect(second.error).toContain("আগেই");

    const count = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ n: number }[]>`select count(*)::int as n from shipment where order_id = ${ORDER_ID}`,
    );
    expect(count[0]!.n).toBe(1);
  });

  it("4b. unique constraint truly blocks a duplicate consignment_id (direct insert)", async () => {
    // Prove the constraint itself, independent of the app-level hasShipment guard.
    await expect(
      withTenant(TENANT_A, OWNER_A, async (tx) => {
        await tx`
          insert into shipment (tenant_id, order_id, provider, consignment_id, tracking_code, status, cod_amount)
          values (${TENANT_A}, ${ORDER_ID}, 'steadfast', '1424107', 'DUP', 'created', 1000)
        `;
      }),
    ).rejects.toThrow();
  });

  it("5. courier-sync (stubbed delivered) reconciles shipment + order; COD stays OWED", async () => {
    // The order already has a shipment (status 'created') from test 3. Sync with
    // a 'delivered' status → shipment delivered, order delivered. Delivery does
    // NOT mean the courier has remitted the cash, so cod_status stays 'pending'
    // and cod_collected is never fabricated (remittance reconciliation = Phase-2).
    const provider = new SteadfastProvider({ fetch: makeFakeFetch("delivered") });
    const synced = await syncTenantShipments(TENANT_A, provider, STEADFAST);
    expect(synced).toBe(1);

    const row = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<
        {
          status: string;
          cod_status: string;
          cod_collected: string | null;
          delivered_at: string | null;
          fulfillment_status: string;
        }[]
      >`
        select s.status, s.cod_status, s.cod_collected, s.delivered_at, o.fulfillment_status
        from shipment s join orders o on o.id = s.order_id
        where s.order_id = ${ORDER_ID}
      `,
    );
    expect(row[0]!.status).toBe("delivered");
    // COD remains owed: pending, no collected amount fabricated on delivery alone.
    expect(row[0]!.cod_status).toBe("pending");
    expect(row[0]!.cod_collected).toBeNull();
    expect(row[0]!.delivered_at).not.toBeNull();
    expect(row[0]!.fulfillment_status).toBe("delivered");
  });

  it("6. COD-pending still lists the delivered order — cash owed until remittance", async () => {
    // After delivery (test 5), cod_status is still 'pending' → the order REMAINS
    // on the seller's "money owed to me" list until a remittance reconciliation.
    const cod = await getCodPending(TENANT_A, OWNER_A);
    const owed = cod.rows.find((r) => r.orderId === ORDER_ID);
    expect(owed).toBeDefined();
    expect(owed!.codAmount).toBe(1000);
  });
});
