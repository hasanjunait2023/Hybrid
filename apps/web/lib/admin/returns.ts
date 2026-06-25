// Returns / RTO / Exchange data layer (08_returns.sql). All reads/writes go
// through withTenant (RLS). Status-transition side effects (restock on receipt,
// refund stamping, resolve timestamps) live in updateReturnStatus and run inside
// a single withTenant txn so they are atomic. The admin Server Actions in
// app/(admin)/admin/returns/actions.ts wrap these and revalidate the
// tenant:{id}:returns / :products / :order:{id} / :dashboard cache tags.
//
// Numerals are Latin in admin (DESIGN §4.4); formatting happens at the view
// layer. postgres.js returns numeric(14,2) as strings — Number() them.
import { withTenant } from "@hybrid/db";

export type ReturnType = "return" | "exchange" | "rto";
export type ReturnStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "in_transit"
  | "received"
  | "refunded"
  | "completed"
  | "cancelled";
export type ReturnReason =
  | "wrong_item"
  | "damaged"
  | "size_issue"
  | "not_as_described"
  | "customer_refused"
  | "rto_undelivered"
  | "fake_order"
  | "other";
export type RefundMethod = "bkash" | "nagad" | "cash" | "none";

export interface ReturnListRow {
  id: string;
  orderId: string;
  orderNumber: number;
  customerName: string | null;
  customerPhone: string | null;
  type: ReturnType;
  status: ReturnStatus;
  reason: ReturnReason;
  refundAmount: number;
  itemCount: number;
  createdAt: string;
}

export interface ReturnDetailItem {
  id: string;
  orderItemId: string | null;
  variantId: string | null;
  title: string;
  quantity: number;
  restock: boolean;
}

export interface ReturnDetail extends ReturnListRow {
  refundMethod: RefundMethod;
  note: string | null;
  reverseShipmentId: string | null;
  restocked: boolean;
  resolvedAt: string | null;
  orderGrandTotal: number;
  items: ReturnDetailItem[];
}

export interface ReturnStats {
  open: number;
  rtoQueue: number;
  refundedThisMonth: number;
  refundAmountThisMonth: number;
}

export interface ReturnListFilter {
  /** return_status, or undefined for all. */
  status?: string;
  /** return_type, or undefined for all. */
  type?: string;
  /** order_number (digits) or customer_phone search. */
  query?: string;
}

// ---- List ------------------------------------------------------------------
export async function listReturns(
  tenantId: string,
  userId: string,
  filter: ReturnListFilter = {},
): Promise<ReturnListRow[]> {
  const status = filter.status?.trim() ? filter.status.trim() : null;
  const type = filter.type?.trim() ? filter.type.trim() : null;
  const query = filter.query?.trim() ? `%${filter.query.trim()}%` : null;

  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      {
        id: string;
        order_id: string;
        order_number: string;
        customer_name: string | null;
        customer_phone: string | null;
        type: ReturnType;
        status: ReturnStatus;
        reason: ReturnReason;
        refund_amount: string;
        item_count: number;
        created_at: string;
      }[]
    >`
      select
        rr.id, rr.order_id, o.order_number, o.customer_name, o.customer_phone,
        rr.type, rr.status, rr.reason, rr.refund_amount,
        (select count(*)::int from return_item ri where ri.return_id = rr.id) as item_count,
        rr.created_at
      from return_request rr
      join orders o on o.id = rr.order_id
      where (${status}::return_status is null or rr.status = ${status}::return_status)
        and (${type}::return_type is null or rr.type = ${type}::return_type)
        and (
          ${query}::text is null
          or o.customer_phone ilike ${query}
          or o.order_number::text ilike ${query}
        )
      order by rr.created_at desc
      limit 200
    `,
  );

  return rows.map(mapReturnRow);
}

function mapReturnRow(r: {
  id: string;
  order_id: string;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  type: ReturnType;
  status: ReturnStatus;
  reason: ReturnReason;
  refund_amount: string;
  item_count: number;
  created_at: string;
}): ReturnListRow {
  return {
    id: r.id,
    orderId: r.order_id,
    orderNumber: Number(r.order_number),
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    type: r.type,
    status: r.status,
    reason: r.reason,
    refundAmount: Number(r.refund_amount),
    itemCount: r.item_count,
    createdAt: r.created_at,
  };
}

// ---- Stats -----------------------------------------------------------------
export async function getReturnStats(
  tenantId: string,
  userId: string,
): Promise<ReturnStats> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      {
        open: number;
        rto_queue: number;
        refunded_count: number;
        refund_amount: string;
      }[]
    >`
      select
        count(*) filter (where status not in ('completed','cancelled','rejected'))::int as open,
        count(*) filter (where type = 'rto' and status not in ('completed','cancelled'))::int as rto_queue,
        count(*) filter (
          where refunded_at is not null
            and date_trunc('month', refunded_at at time zone 'Asia/Dhaka')
                = date_trunc('month', now() at time zone 'Asia/Dhaka')
        )::int as refunded_count,
        coalesce(sum(refund_amount) filter (
          where refunded_at is not null
            and date_trunc('month', refunded_at at time zone 'Asia/Dhaka')
                = date_trunc('month', now() at time zone 'Asia/Dhaka')
        ), 0) as refund_amount
      from return_request
    `,
  );
  const r = rows[0];
  return {
    open: r?.open ?? 0,
    rtoQueue: r?.rto_queue ?? 0,
    refundedThisMonth: r?.refunded_count ?? 0,
    refundAmountThisMonth: Number(r?.refund_amount ?? 0),
  };
}

// ---- Detail ----------------------------------------------------------------
export async function getReturn(
  tenantId: string,
  userId: string,
  returnId: string,
): Promise<ReturnDetail | null> {
  return withTenant(tenantId, userId, async (tx) => {
    const rows = await tx<
      {
        id: string;
        order_id: string;
        order_number: string;
        customer_name: string | null;
        customer_phone: string | null;
        type: ReturnType;
        status: ReturnStatus;
        reason: ReturnReason;
        refund_amount: string;
        refund_method: RefundMethod;
        note: string | null;
        reverse_shipment_id: string | null;
        restocked: boolean;
        resolved_at: string | null;
        created_at: string;
        order_grand_total: string;
      }[]
    >`
      select
        rr.id, rr.order_id, o.order_number, o.customer_name, o.customer_phone,
        rr.type, rr.status, rr.reason, rr.refund_amount, rr.refund_method,
        rr.note, rr.reverse_shipment_id, rr.restocked, rr.resolved_at, rr.created_at,
        o.grand_total as order_grand_total
      from return_request rr
      join orders o on o.id = rr.order_id
      where rr.id = ${returnId} limit 1
    `;
    const r = rows[0];
    if (!r) return null;

    const items = await tx<
      {
        id: string;
        order_item_id: string | null;
        variant_id: string | null;
        title: string | null;
        quantity: number;
        restock: boolean;
      }[]
    >`
      select id, order_item_id, variant_id, title, quantity, restock
      from return_item where return_id = ${returnId} order by created_at asc
    `;

    return {
      ...mapReturnRow({ ...r, item_count: items.length }),
      refundMethod: r.refund_method,
      note: r.note,
      reverseShipmentId: r.reverse_shipment_id,
      restocked: r.restocked,
      resolvedAt: r.resolved_at,
      orderGrandTotal: Number(r.order_grand_total),
      items: items.map((i) => ({
        id: i.id,
        orderItemId: i.order_item_id,
        variantId: i.variant_id,
        title: i.title ?? "",
        quantity: i.quantity,
        restock: i.restock,
      })),
    };
  });
}

// ---- Create ----------------------------------------------------------------
export interface CreateReturnInput {
  orderId: string;
  type: ReturnType;
  reason: ReturnReason;
  note?: string | null;
  items: {
    orderItemId?: string | null;
    variantId?: string | null;
    title: string;
    quantity: number;
    restock: boolean;
  }[];
}

// One withTenant txn: insert the request + its line items. The order_id FK + RLS
// isolation implicitly enforce that the order belongs to this tenant.
export async function createReturn(
  tenantId: string,
  userId: string,
  input: CreateReturnInput,
): Promise<{ id: string }> {
  return withTenant(tenantId, userId, async (tx) => {
    const rows = await tx<{ id: string }[]>`
      insert into return_request (tenant_id, order_id, type, reason, note)
      values (${tenantId}, ${input.orderId}, ${input.type}::return_type,
              ${input.reason}::return_reason, ${input.note ?? null})
      returning id
    `;
    const returnId = rows[0]!.id;

    for (const item of input.items) {
      await tx`
        insert into return_item
          (tenant_id, return_id, order_item_id, variant_id, title, quantity, restock)
        values (${tenantId}, ${returnId}, ${item.orderItemId ?? null},
                ${item.variantId ?? null}, ${item.title}, ${item.quantity}, ${item.restock})
      `;
    }

    return { id: returnId };
  });
}

// ---- Status transition -----------------------------------------------------
export interface UpdateReturnStatusOpts {
  refundAmount?: number;
  refundMethod?: RefundMethod;
}

// Single txn. Side effects per target status:
//   received  → if not already restocked, add back tracked inventory for each
//               restock=true line with a variant, then set restocked=true. Guard
//               on the restocked flag so re-receiving never double-restocks.
//   refunded  → stamp refunded_at; apply refundAmount/refundMethod when provided.
//   completed/cancelled/rejected → stamp resolved_at.
// updated_at is always bumped.
export async function updateReturnStatus(
  tenantId: string,
  userId: string,
  returnId: string,
  status: ReturnStatus,
  opts: UpdateReturnStatusOpts = {},
): Promise<void> {
  await withTenant(tenantId, userId, async (tx) => {
    if (status === "received") {
      const rows = await tx<{ restocked: boolean }[]>`
        select restocked from return_request where id = ${returnId} for update
      `;
      const alreadyRestocked = rows[0]?.restocked ?? true;
      if (!alreadyRestocked) {
        await tx`
          update product_variant v
             set inventory_quantity = v.inventory_quantity + ri.quantity,
                 updated_at = now()
            from return_item ri
           where ri.return_id = ${returnId}
             and ri.restock = true
             and ri.variant_id = v.id
             and v.track_inventory = true
        `;
        await tx`
          update return_request set restocked = true, status = ${status}::return_status,
                 updated_at = now()
          where id = ${returnId}
        `;
        return;
      }
      await tx`
        update return_request set status = ${status}::return_status, updated_at = now()
        where id = ${returnId}
      `;
      return;
    }

    if (status === "refunded") {
      const refundAmount = opts.refundAmount ?? null;
      const refundMethod = opts.refundMethod ?? null;
      await tx`
        update return_request
           set status = ${status}::return_status,
               refunded_at = now(),
               refund_amount = coalesce(${refundAmount}::numeric, refund_amount),
               refund_method = coalesce(${refundMethod}::refund_method, refund_method),
               updated_at = now()
        where id = ${returnId}
      `;
      return;
    }

    const resolving =
      status === "completed" || status === "cancelled" || status === "rejected";
    await tx`
      update return_request
         set status = ${status}::return_status,
             resolved_at = ${resolving ? new Date() : null},
             updated_at = now()
      where id = ${returnId}
    `;
  });
}
