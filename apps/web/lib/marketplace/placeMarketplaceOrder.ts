import "server-only";

// Split-cart marketplace checkout (M3). THE orchestrator that turns one buyer's
// cross-vendor cart into one COD sub-order PER VENDOR, grouped under a single
// marketplace_order parent.
//
// This is a SAGA, not a transaction: each vendor sub-order is its own atomic
// withTenant() commit (one RLS context per txn — there is no cross-tenant 2PC).
// Vendors are processed SEQUENTIALLY; if one fails (e.g. out of stock) the others
// still stand and the parent ends 'partial'. The reconcile cron recovers any
// parent left 'pending' by a mid-saga crash.
//
// Money: COD only in the base. Each sub-order is a normal tenant `orders` row
// (channel='marketplace', payment 'cod'), fulfilled through the vendor's existing
// admin + courier + COD reconciliation — the marketplace adds nothing to that path.
//
// Contexts: withBuyer (parent shell + finalize) · withTenant (each sub-order via
// placeOrder) · asPlatformAdmin (the suborder/commission bridge rows, which span
// buyer-owned and tenant data — the legitimate platform-tooling path).
import { withBuyer, asPlatformAdmin } from "@hybrid/db";
import { placeOrder, InsufficientStockError } from "@/lib/commerce/placeOrder";
import { calculateShipping } from "@/lib/commerce/shipping";
import { sendMarketplaceBuyerConfirmation } from "@/lib/sms/notify";

export interface MpCartLine {
  tenantId: string;
  variantId: string;
  quantity: number;
}

export interface PlaceMarketplaceOrderInput {
  buyerId: string;
  /** Client-supplied dedupe key; a re-submit returns the existing parent. */
  idempotencyKey?: string | null;
  contact: { name: string; phone: string };
  shipTo: {
    division: string;
    district: string;
    thana: string;
    line: string;
  };
  lines: MpCartLine[];
  /** Payment method chosen by the buyer; stored for the payment agent. */
  paymentMethod?: "cod" | "online";
}

export interface MpVendorOutcome {
  tenantId: string;
  vendorName: string;
  status: "confirmed" | "failed";
  orderId?: string;
  orderNumber?: number;
  grandTotal?: number;
  /** Friendly failure reason (e.g. out-of-stock variant id). */
  reason?: string;
  failedVariantId?: string;
}

export interface PlaceMarketplaceOrderResult {
  marketplaceOrderId: string;
  status: "pending" | "confirmed" | "partial" | "failed";
  confirmed: MpVendorOutcome[];
  failed: MpVendorOutcome[];
  /** true when an idempotent re-submit returned the already-placed parent. */
  replayed: boolean;
}

interface SuccessLeg {
  tenantId: string;
  vendorName: string;
  orderId: string;
  orderNumber: number;
  itemsSubtotal: number;
  shippingTotal: number;
  grandTotal: number;
  codAmount: number;
}

function groupByVendor(lines: MpCartLine[]): Map<string, MpCartLine[]> {
  const map = new Map<string, MpCartLine[]>();
  for (const line of lines) {
    const list = map.get(line.tenantId) ?? [];
    list.push(line);
    map.set(line.tenantId, list);
  }
  return map;
}

export async function placeMarketplaceOrder(
  input: PlaceMarketplaceOrderInput,
): Promise<PlaceMarketplaceOrderResult> {
  if (input.lines.length === 0) throw new Error("EMPTY_CART");
  const groups = groupByVendor(input.lines);

  // Idempotency: a prior parent with the same key → return its current state.
  const idemKey = input.idempotencyKey ?? null;
  if (idemKey) {
    const existing = await withBuyer(input.buyerId, (tx) =>
      tx<{ id: string; status: string }[]>`
        select id, status from marketplace_order
         where buyer_id = ${input.buyerId} and idempotency_key = ${idemKey}
         limit 1
      `,
    );
    if (existing[0]) {
      return rebuildResult(input.buyerId, existing[0].id, existing[0].status, true);
    }
  }

  const paymentMethod = input.paymentMethod ?? "cod";

  // (1) Parent shell (buyer-owned). One checkout, all vendors share the
  // ship-to + contact snapshot. payment_method stored for the payment agent.
  const parent = await withBuyer(input.buyerId, (tx) =>
    tx<{ id: string }[]>`
      insert into marketplace_order
        (buyer_id, status, idempotency_key, vendor_count, payment_method,
         contact_name, contact_phone, ship_division, ship_district, ship_thana, ship_line)
      values
        (${input.buyerId}, 'pending', ${idemKey}, ${groups.size}, ${paymentMethod},
         ${input.contact.name}, ${input.contact.phone}, ${input.shipTo.division},
         ${input.shipTo.district}, ${input.shipTo.thana}, ${input.shipTo.line})
      returning id
    `,
  );
  const mpOrderId = parent[0]!.id;

  // (2) Per-vendor sub-orders (sequential saga). Each placeOrder is its own
  // atomic withTenant commit; a stock failure on one vendor does not roll back
  // the others (partial model).
  const successes: SuccessLeg[] = [];
  const failures: MpVendorOutcome[] = [];

  for (const [tenantId, vendorLines] of groups) {
    try {
      // Enforce MOQ (minimum order quantity) before placing sub-orders.
      const variantIds = vendorLines.map((l) => l.variantId);
      const moqRows = await asPlatformAdmin((tx) =>
        tx<{ id: string; moq: number | null }[]>`
          select id, moq
          from marketplace_listing_variant
          where id = any(${variantIds})
            and tenant_id = ${tenantId}
        `,
      );
      const moqMap = new Map(moqRows.map((r) => [r.id, r.moq ?? 1]));
      const moqViolation = vendorLines.find((l) => l.quantity < (moqMap.get(l.variantId) ?? 1));
      if (moqViolation) {
        failures.push({
          tenantId,
          vendorName: "",
          status: "failed",
          reason: "below_moq",
          failedVariantId: moqViolation.variantId,
        });
        continue;
      }

      const quote = await calculateShipping(tenantId, null, {
        items: vendorLines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        destDivision: input.shipTo.division,
        destDistrict: input.shipTo.district,
      });
      const shippingTotal = quote.amount ?? 0;

      const placed = await placeOrder({
        tenantId,
        userId: null,
        customer: { phone: input.contact.phone, name: input.contact.name },
        shippingAddress: {
          recipient: input.contact.name,
          phone: input.contact.phone,
          division: input.shipTo.division,
          district: input.shipTo.district,
          thana: input.shipTo.thana,
          line: input.shipTo.line,
        },
        items: vendorLines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        paymentMethod: "cod",
        source: "storefront",
        channel: "marketplace",
        marketplaceOrderId: mpOrderId,
        shippingTotal,
      });

      successes.push({
        tenantId,
        vendorName: "",
        orderId: placed.orderId,
        orderNumber: placed.orderNumber,
        itemsSubtotal: 0,
        shippingTotal,
        grandTotal: 0,
        codAmount: 0,
      });
    } catch (error) {
      const failedVariantId =
        error instanceof InsufficientStockError ? error.variantId : undefined;
      failures.push({
        tenantId,
        vendorName: "",
        status: "failed",
        reason: failedVariantId ? "out_of_stock" : "error",
        failedVariantId,
      });
      if (!(error instanceof InsufficientStockError)) {
        console.error(`[marketplace-checkout] vendor ${tenantId} failed`, error);
      }
    }
  }

  // (3) Bridge rows for the successful legs (platform-tooling: spans buyer-owned
  // marketplace tables + tenant order/vendor data). One asPlatformAdmin txn.
  await asPlatformAdmin(async (tx) => {
    const cfg = await tx<{ commission_rate: string }[]>`
      select commission_rate from marketplace_config where id = true limit 1
    `;
    const rate = Number(cfg[0]?.commission_rate ?? 0.05);

    for (const leg of successes) {
      const orderRows = await tx<
        { subtotal: string; shipping_total: string; grand_total: string; cod_amount: string }[]
      >`
        select subtotal, shipping_total, grand_total, cod_amount
          from orders where id = ${leg.orderId}
      `;
      const o = orderRows[0]!;
      leg.itemsSubtotal = Number(o.subtotal);
      leg.shippingTotal = Number(o.shipping_total);
      leg.grandTotal = Number(o.grand_total);
      leg.codAmount = Number(o.cod_amount);

      const vendorRows = await tx<{ name: string }[]>`
        select name from tenant where id = ${leg.tenantId}
      `;
      leg.vendorName = vendorRows[0]?.name ?? "";

      const subRows = await tx<{ id: string }[]>`
        insert into marketplace_suborder
          (marketplace_order_id, buyer_id, tenant_id, vendor_name, order_id, order_number,
           status, payment_status, items_subtotal, shipping_total, grand_total, cod_amount)
        values
          (${mpOrderId}, ${input.buyerId}, ${leg.tenantId}, ${leg.vendorName},
           ${leg.orderId}, ${leg.orderNumber}, 'confirmed', 'unpaid',
           ${leg.itemsSubtotal}, ${leg.shippingTotal}, ${leg.grandTotal}, ${leg.codAmount})
        returning id
      `;
      const suborderId = subRows[0]!.id;

      const commission = Math.round(leg.itemsSubtotal * rate * 100) / 100;
      await tx`
        insert into marketplace_commission
          (marketplace_order_id, suborder_id, tenant_id, gross, rate, commission_amount)
        values
          (${mpOrderId}, ${suborderId}, ${leg.tenantId}, ${leg.itemsSubtotal}, ${rate}, ${commission})
      `;
    }
  });

  // (4) Finalize the parent (buyer-owned).
  const status: PlaceMarketplaceOrderResult["status"] =
    failures.length === 0 ? "confirmed" : successes.length > 0 ? "partial" : "failed";
  const itemsTotal = successes.reduce((s, l) => s + l.itemsSubtotal, 0);
  const shippingTotal = successes.reduce((s, l) => s + l.shippingTotal, 0);
  const grandTotal = successes.reduce((s, l) => s + l.grandTotal, 0);

  await withBuyer(input.buyerId, (tx) =>
    tx`
      update marketplace_order set
        status = ${status},
        vendor_count = ${successes.length},
        items_total = ${itemsTotal},
        shipping_total = ${shippingTotal},
        grand_total = ${grandTotal},
        updated_at = now()
      where id = ${mpOrderId}
    `,
  );

  // Non-blocking confirmation SMS to buyer. Fire-and-forget — checkout has
  // already committed; a gateway error here must never surface to the buyer.
  if (successes.length > 0) {
    void sendMarketplaceBuyerConfirmation(input.contact.phone, {
      buyerName: input.contact.name,
      vendorCount: successes.length,
      grandTotal,
    }).catch((err) => {
      console.error("[marketplace-checkout] buyer SMS failed", err);
    });
  }

  return {
    marketplaceOrderId: mpOrderId,
    status,
    confirmed: successes.map((l) => ({
      tenantId: l.tenantId,
      vendorName: l.vendorName,
      status: "confirmed" as const,
      orderId: l.orderId,
      orderNumber: l.orderNumber,
      grandTotal: l.grandTotal,
    })),
    failed: failures,
    replayed: false,
  };
}

// Re-read a parent's outcome for an idempotent replay.
async function rebuildResult(
  buyerId: string,
  mpOrderId: string,
  status: string,
  replayed: boolean,
): Promise<PlaceMarketplaceOrderResult> {
  const subs = await withBuyer(buyerId, (tx) =>
    tx<
      { tenant_id: string; vendor_name: string; order_id: string; order_number: string; grand_total: string }[]
    >`
      select tenant_id, vendor_name, order_id, order_number, grand_total
        from marketplace_suborder where marketplace_order_id = ${mpOrderId}
    `,
  );
  return {
    marketplaceOrderId: mpOrderId,
    status: status as PlaceMarketplaceOrderResult["status"],
    confirmed: subs.map((s) => ({
      tenantId: s.tenant_id,
      vendorName: s.vendor_name,
      status: "confirmed" as const,
      orderId: s.order_id,
      orderNumber: Number(s.order_number),
      grandTotal: Number(s.grand_total),
    })),
    failed: [],
    replayed,
  };
}
