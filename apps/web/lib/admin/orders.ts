// Orders data layer (blueprint S-ORDERS 1.3). All reads via withTenant (RLS).
// Status transitions + cancel-restores-inventory live in the Server Actions
// (app/(admin)/admin/orders/actions.ts); this module is reads + the shared
// shapes + the transition rules table.
import { withTenant } from "@hybrid/db";
import type { Tx } from "@hybrid/db";

// ---- Status pipeline (DESIGN §P3.2) ----------------------------------------
// The linear lifecycle + terminal off-ramps. Server-validated transitions: a
// status may only move to an allowed next state. cancel restores inventory.
export const FULFILLMENT_FLOW = [
  "pending",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
] as const;

export type FulfillmentStatus =
  | (typeof FULFILLMENT_FLOW)[number]
  | "in_transit"
  | "returned"
  | "cancelled";

// Allowed forward transitions (server-validated). cancel/return are reachable
// from any non-terminal state; the linear path advances one step.
const TRANSITIONS: Record<string, FulfillmentStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["in_transit", "delivered", "returned"],
  in_transit: ["delivered", "returned"],
  delivered: ["returned"],
  returned: [],
  cancelled: [],
};

export function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from] ?? []).includes(to as FulfillmentStatus);
}

/**
 * Whether a cancel is allowed given the order's payment status. P1 has no
 * auto-refund: cancelling a PAID order would restore stock while leaving money
 * the seller still owes the customer — a money/inventory inconsistency. The
 * seller must refund out-of-band first. Returns false to BLOCK the cancel.
 */
export function canCancelOrder(paymentStatus: string): boolean {
  return paymentStatus !== "paid";
}

/** The single contextual next action for the list/detail primary button. */
export function nextAction(status: string): { to: FulfillmentStatus; bn: string } | null {
  switch (status) {
    case "pending":
      return { to: "confirmed", bn: "নিশ্চিত করুন" };
    case "confirmed":
      return { to: "packed", bn: "প্যাক করুন" };
    case "packed":
      return { to: "shipped", bn: "কুরিয়ারে পাঠান" };
    case "shipped":
    case "in_transit":
      return { to: "delivered", bn: "ডেলিভার্ড করুন" };
    default:
      return null;
  }
}

// ---- List ------------------------------------------------------------------
export interface OrderListFilter {
  fulfillment?: string; // a status, or undefined for all
  payment?: string; // order_payment_status
  source?: string; // order_source
  /** phone or order_number search. */
  query?: string;
  /** "codPending" pseudo-filter — COD orders not yet collected (money triage). */
  codPending?: boolean;
}

export interface OrderListRow {
  id: string;
  orderNumber: number;
  customerName: string | null;
  customerPhone: string | null;
  grandTotal: number;
  codAmount: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  source: string;
  paymentProvider: string | null;
  placedAt: string;
}

export async function listOrders(
  tenantId: string,
  userId: string,
  filter: OrderListFilter = {},
): Promise<OrderListRow[]> {
  const fulfillment = filter.fulfillment ?? null;
  const payment = filter.payment ?? null;
  const source = filter.source ?? null;
  const codPending = filter.codPending ?? false;
  const rawQuery = filter.query?.trim() ?? "";
  const phoneQuery = rawQuery ? `%${rawQuery}%` : null;
  // order_number is numeric — only match when the query is all digits.
  const numberQuery = /^\d+$/.test(rawQuery) ? Number(rawQuery) : null;

  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      {
        id: string;
        order_number: string;
        customer_name: string | null;
        customer_phone: string | null;
        grand_total: string;
        cod_amount: string;
        payment_status: string;
        fulfillment_status: string;
        source: string;
        payment_provider: string | null;
        placed_at: string;
      }[]
    >`
      select
        o.id, o.order_number, o.customer_name, o.customer_phone,
        o.grand_total, o.cod_amount, o.payment_status, o.fulfillment_status,
        o.source, o.placed_at,
        (select p.provider from payment p where p.order_id = o.id order by p.created_at asc limit 1) as payment_provider
      from orders o
      where (${fulfillment}::order_fulfillment_status is null or o.fulfillment_status = ${fulfillment}::order_fulfillment_status)
        and (${payment}::order_payment_status is null or o.payment_status = ${payment}::order_payment_status)
        and (${source}::order_source is null or o.source = ${source}::order_source)
        and (${codPending} = false or (o.cod_amount > 0 and o.payment_status = 'unpaid'
              and o.fulfillment_status not in ('cancelled','returned')))
        and (
          ${phoneQuery}::text is null
          or o.customer_phone ilike ${phoneQuery}
          or o.customer_name ilike ${phoneQuery}
          or (${numberQuery}::bigint is not null and o.order_number = ${numberQuery}::bigint)
        )
      order by o.placed_at desc
      limit 200
    `,
  );

  return rows.map(mapOrderRow);
}

function mapOrderRow(r: {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  grand_total: string;
  cod_amount: string;
  payment_status: string;
  fulfillment_status: string;
  source: string;
  payment_provider: string | null;
  placed_at: string;
}): OrderListRow {
  return {
    id: r.id,
    orderNumber: Number(r.order_number),
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    grandTotal: Number(r.grand_total),
    codAmount: Number(r.cod_amount),
    paymentStatus: r.payment_status,
    fulfillmentStatus: r.fulfillment_status,
    source: r.source,
    paymentProvider: r.payment_provider,
    placedAt: r.placed_at,
  };
}

/** Counts per fulfillment status for the filter pills (DESIGN §P3.1). */
export async function getOrderStatusCounts(
  tenantId: string,
  userId: string,
): Promise<{ all: number; byStatus: Record<string, number>; codPending: number }> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ fulfillment_status: string; n: number }[]>`
      select fulfillment_status, count(*)::int as n from orders group by fulfillment_status
    `,
  );
  const codRows = await withTenant(tenantId, userId, (tx) =>
    tx<{ n: number }[]>`
      select count(*)::int as n from orders
      where cod_amount > 0 and payment_status = 'unpaid'
        and fulfillment_status not in ('cancelled','returned')
    `,
  );
  const byStatus: Record<string, number> = {};
  let all = 0;
  for (const r of rows) {
    byStatus[r.fulfillment_status] = r.n;
    all += r.n;
  }
  return { all, byStatus, codPending: codRows[0]?.n ?? 0 };
}

// ---- Detail ----------------------------------------------------------------
export interface OrderAddress {
  recipient?: string;
  phone?: string;
  division?: string;
  district?: string;
  thana?: string;
  line?: string;
}

export interface OrderItemRow {
  id: string;
  variantId: string | null;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderPayment {
  provider: string;
  status: string;
  amount: number;
  transactionId: string | null;
}

export interface OrderShipment {
  provider: string;
  consignmentId: string | null;
  trackingCode: string | null;
  status: string;
  codStatus: string;
}

export interface OrderDetail {
  id: string;
  orderNumber: number;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  shippingAddress: OrderAddress;
  subtotal: number;
  shippingTotal: number;
  grandTotal: number;
  codAmount: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  source: string;
  note: string | null;
  placedAt: string;
  items: OrderItemRow[];
  payment: OrderPayment | null;
  shipment: OrderShipment | null;
}

export async function getOrderDetail(
  tenantId: string,
  userId: string,
  orderId: string,
): Promise<OrderDetail | null> {
  return withTenant(tenantId, userId, async (tx) => {
    const orders = await tx<
      {
        id: string;
        order_number: string;
        customer_id: string | null;
        customer_name: string | null;
        customer_phone: string | null;
        customer_email: string | null;
        shipping_address: OrderAddress;
        subtotal: string;
        shipping_total: string;
        grand_total: string;
        cod_amount: string;
        payment_status: string;
        fulfillment_status: string;
        source: string;
        note: string | null;
        placed_at: string;
      }[]
    >`
      select id, order_number, customer_id, customer_name, customer_phone, customer_email,
             shipping_address, subtotal, shipping_total, grand_total, cod_amount,
             payment_status, fulfillment_status, source, note, placed_at
      from orders where id = ${orderId} limit 1
    `;
    const o = orders[0];
    if (!o) return null;

    const items = await tx<
      {
        id: string;
        variant_id: string | null;
        title: string;
        variant_title: string | null;
        sku: string | null;
        unit_price: string;
        quantity: number;
        line_total: string;
      }[]
    >`
      select id, variant_id, title, variant_title, sku, unit_price, quantity, line_total
      from order_item where order_id = ${orderId} order by created_at asc
    `;

    const payments = await tx<
      { provider: string; status: string; amount: string; transaction_id: string | null }[]
    >`
      select provider, status, amount, transaction_id from payment
      where order_id = ${orderId} order by created_at asc limit 1
    `;

    const shipments = await tx<
      {
        provider: string;
        consignment_id: string | null;
        tracking_code: string | null;
        status: string;
        cod_status: string;
      }[]
    >`
      select provider, consignment_id, tracking_code, status, cod_status
      from shipment where order_id = ${orderId} order by created_at desc limit 1
    `;

    return {
      id: o.id,
      orderNumber: Number(o.order_number),
      customerId: o.customer_id,
      customerName: o.customer_name,
      customerPhone: o.customer_phone,
      customerEmail: o.customer_email,
      shippingAddress: o.shipping_address ?? {},
      subtotal: Number(o.subtotal),
      shippingTotal: Number(o.shipping_total),
      grandTotal: Number(o.grand_total),
      codAmount: Number(o.cod_amount),
      paymentStatus: o.payment_status,
      fulfillmentStatus: o.fulfillment_status,
      source: o.source,
      note: o.note,
      placedAt: o.placed_at,
      items: items.map((i) => ({
        id: i.id,
        variantId: i.variant_id,
        title: i.title,
        variantTitle: i.variant_title,
        sku: i.sku,
        unitPrice: Number(i.unit_price),
        quantity: i.quantity,
        lineTotal: Number(i.line_total),
      })),
      payment: payments[0]
        ? {
            provider: payments[0].provider,
            status: payments[0].status,
            amount: Number(payments[0].amount),
            transactionId: payments[0].transaction_id,
          }
        : null,
      shipment: shipments[0]
        ? {
            provider: shipments[0].provider,
            consignmentId: shipments[0].consignment_id,
            trackingCode: shipments[0].tracking_code,
            status: shipments[0].status,
            codStatus: shipments[0].cod_status,
          }
        : null,
    };
  });
}

// ---- Mutation helpers (called inside a Server Action's withTenant txn) ------

/**
 * Restore inventory for every tracked line of an order — used when cancelling.
 * Mirrors the atomic decrement in placeOrder in reverse. Runs inside the
 * caller's txn so cancel + restore is one atomic unit.
 */
export async function restoreInventory(tx: Tx, orderId: string): Promise<void> {
  await tx`
    update product_variant v
       set inventory_quantity = v.inventory_quantity + oi.quantity,
           updated_at = now()
      from order_item oi
     where oi.order_id = ${orderId}
       and oi.variant_id = v.id
       and v.track_inventory = true
  `;
}
