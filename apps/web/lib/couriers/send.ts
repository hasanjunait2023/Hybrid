// Send-to-courier core (blueprint S-COURIER-WIRE 1.8). Extracted from the Server
// Action so it is testable in isolation: it takes an injected CourierAdapter and
// a creds reader, so the integration suite can stub the Steadfast network call
// (fake fetch) while exercising the REAL shipment write + status flip + the
// double-send guard. Clean imports (@hybrid/* only) so it loads in the test
// harness without the Next request context.
import { withTenant } from "@hybrid/db";
import type { Tx } from "@hybrid/db";
import type { CourierAdapter, CourierCreds } from "@hybrid/couriers";
import { CourierNotConfiguredError } from "./steadfast";

export interface CourierActionResult {
  ok: boolean;
  error?: string;
  consignmentId?: string;
  trackingCode?: string;
}

interface ShipAddress {
  recipient?: string;
  phone?: string;
  division?: string;
  district?: string;
  thana?: string;
  line?: string;
}

interface OrderForShipment {
  orderNumber: number;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  codAmount: number;
  note: string | null;
  hasShipment: boolean;
}

// Compose the courier recipient_address from the structured shipping_address.
// Bangla-or-Latin text the rider reads; line first, then thana/district/division.
function composeAddress(addr: ShipAddress): string {
  return [addr.line, addr.thana, addr.district, addr.division]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ");
}

async function readOrderForShipment(
  tx: Tx,
  orderId: string,
): Promise<OrderForShipment | null> {
  const rows = await tx<
    {
      order_number: string;
      customer_name: string | null;
      customer_phone: string | null;
      shipping_address: ShipAddress;
      cod_amount: string;
      note: string | null;
    }[]
  >`
    select order_number, customer_name, customer_phone, shipping_address,
           cod_amount, note
    from orders where id = ${orderId} limit 1
  `;
  const o = rows[0];
  if (!o) return null;

  const existing = await tx<{ n: number }[]>`
    select count(*)::int as n from shipment where order_id = ${orderId}
  `;

  const addr = o.shipping_address ?? {};
  return {
    orderNumber: Number(o.order_number),
    recipientName: addr.recipient || o.customer_name || "",
    recipientPhone: addr.phone || o.customer_phone || "",
    recipientAddress: composeAddress(addr),
    codAmount: Number(o.cod_amount),
    note: o.note,
    hasShipment: (existing[0]?.n ?? 0) > 0,
  };
}

// Postgres unique-violation (shipment_consignment_uniq) — the double-send guard.
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export async function sendToCourierCore(
  tenantId: string,
  userId: string | null,
  orderId: string,
  provider: CourierAdapter,
  readCreds: (tx: Tx) => Promise<CourierCreds | null>,
): Promise<CourierActionResult> {
  try {
    const result = await withTenant(tenantId, userId, async (tx) => {
      const order = await readOrderForShipment(tx, orderId);
      if (!order) throw new Error("ORDER_NOT_FOUND");
      if (order.hasShipment) throw new Error("ALREADY_SHIPPED");
      if (!order.recipientPhone || !order.recipientAddress) {
        throw new Error("INCOMPLETE_ADDRESS");
      }

      const creds = await readCreds(tx);
      if (!creds) throw new CourierNotConfiguredError();

      // Live network call. Steadfast invoice = the human order number.
      const consignment = await provider.createConsignment(
        {
          invoice: String(order.orderNumber),
          recipient_name: order.recipientName,
          recipient_phone: order.recipientPhone,
          recipient_address: order.recipientAddress,
          cod_amount: order.codAmount,
          note: order.note ?? "",
        },
        creds,
      );

      // INSERT shipment. shipment_consignment_uniq rejects a duplicate
      // (tenant, provider, consignment_id) — the double-send guard.
      await tx`
        insert into shipment (
          tenant_id, order_id, provider, consignment_id, tracking_code,
          status, cod_amount, cod_status
        ) values (
          ${tenantId}, ${orderId}, 'steadfast',
          ${consignment.consignmentId}, ${consignment.trackingCode},
          'created', ${order.codAmount}, 'pending'
        )
      `;

      // Flip the order to shipped (it has left the building).
      await tx`
        update orders set fulfillment_status = 'shipped', updated_at = now()
        where id = ${orderId}
      `;

      return {
        consignmentId: consignment.consignmentId,
        trackingCode: consignment.trackingCode,
      };
    });

    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof CourierNotConfiguredError) {
      return { ok: false, error: "প্রথমে সেটিংসে কুরিয়ার সংযোগ করুন।" };
    }
    if (isUniqueViolation(error)) {
      return { ok: false, error: "এই অর্ডার আগেই কুরিয়ারে পাঠানো হয়েছে।" };
    }
    const message = error instanceof Error ? error.message : "";
    if (message === "ORDER_NOT_FOUND") return { ok: false, error: "অর্ডার পাওয়া যায়নি।" };
    if (message === "ALREADY_SHIPPED") {
      return { ok: false, error: "এই অর্ডার আগেই কুরিয়ারে পাঠানো হয়েছে।" };
    }
    if (message === "INCOMPLETE_ADDRESS") {
      return { ok: false, error: "ডেলিভারি ঠিকানা বা ফোন নম্বর অসম্পূর্ণ।" };
    }
    // Never log creds; provider error messages carry no secret.
    console.error("[sendToCourier] failed", error);
    return { ok: false, error: "কুরিয়ারে পাঠানো ব্যর্থ হয়েছে।" };
  }
}
