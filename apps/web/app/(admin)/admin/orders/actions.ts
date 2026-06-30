"use server";

// Orders Server Actions (blueprint S-ORDERS 1.3).
//   * updateOrderStatus — server-validated fulfillment transition; cancel
//     restores inventory (atomic, inside the same withTenant txn).
//   * createManualOrder — the F-commerce fast-lane (DESIGN §P3.4): calls the
//     shared placeOrder with source:'manual'.
//   * lookupCustomer — phone → prefill for the manual form.
// Every action authenticates (getSession) and authorizes (membership → tenant);
// mutations revalidate tenant:{id}:orders / :order:{id} / :dashboard /
// :customers / :products.
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { withTenant } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { canTransition, canCancelOrder, restoreInventory } from "@/lib/admin/orders";
import { findCustomerByPhone, type CustomerPrefill } from "@/lib/admin/customers";
import { placeOrder, InsufficientStockError } from "@/lib/commerce/placeOrder";
import { recordAudit, type AuditAction } from "@/lib/audit/record";
import { editOrder as editOrderCore, EditOrderError } from "@/lib/orders/editOrder";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function authTenant(): Promise<
  { ok: true; tenantId: string; userId: string } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  return { ok: true, tenantId, userId: session.userId };
}

function bustOrderTags(tenantId: string, orderId?: string): void {
  revalidateTag(`tenant:${tenantId}:orders`);
  revalidateTag(`tenant:${tenantId}:dashboard`);
  if (orderId) revalidateTag(`tenant:${tenantId}:order:${orderId}`);
}

// ---- Status transition -----------------------------------------------------
const StatusInput = z.object({
  orderId: z.string().uuid(),
  to: z.enum([
    "pending",
    "confirmed",
    "packed",
    "shipped",
    "in_transit",
    "delivered",
    "returned",
    "cancelled",
  ]),
});

export async function updateOrderStatus(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = StatusInput.safeParse({
    orderId: formData.get("orderId"),
    to: formData.get("to"),
  });
  if (!parsed.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  const { orderId, to } = parsed.data;

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      const rows = await tx<{ fulfillment_status: string; payment_status: string }[]>`
        select fulfillment_status, payment_status from orders where id = ${orderId} for update
      `;
      const current = rows[0]?.fulfillment_status;
      const paymentStatus = rows[0]?.payment_status;
      if (!current) throw new Error("ORDER_NOT_FOUND");
      // Server-validated transition — the UI offers only valid moves, but never
      // trust the client.
      if (!canTransition(current, to)) throw new Error("INVALID_TRANSITION");

      // Refuse to cancel a PAID order: P1 has no auto-refund, and restoring stock
      // while leaving the order 'paid' would assert money the seller must still
      // return. The seller refunds out-of-band first (then the order can sit as a
      // paid+returned record). Guards against money/inventory drift.
      if (to === "cancelled" && !canCancelOrder(paymentStatus ?? "")) {
        throw new Error("CANCEL_PAID_BLOCKED");
      }

      // Cancel/return restore inventory before flipping status (one atomic unit).
      if (to === "cancelled" || to === "returned") {
        await restoreInventory(tx, orderId);
      }
      await tx`
        update orders
           set fulfillment_status = ${to}::order_fulfillment_status,
               cancelled_at = ${to === "cancelled" ? new Date() : null},
               updated_at = now()
         where id = ${orderId}
      `;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_TRANSITION") {
      return { ok: false, error: "এই স্ট্যাটাসে যাওয়া যাবে না।" };
    }
    if (message === "ORDER_NOT_FOUND") {
      return { ok: false, error: "অর্ডার পাওয়া যায়নি।" };
    }
    if (message === "CANCEL_PAID_BLOCKED") {
      return {
        ok: false,
        error: "পরিশোধিত অর্ডার বাতিল করা যাবে না — আগে রিফান্ড সম্পন্ন করুন।",
      };
    }
    console.error("[updateOrderStatus] failed", error);
    return { ok: false, error: "স্ট্যাটাস পরিবর্তন ব্যর্থ হয়েছে।" };
  }

  bustOrderTags(auth.tenantId, orderId);
  revalidateTag(`tenant:${auth.tenantId}:products`); // inventory restore may change stock

  // P1.1 — audit trail. Critical money/inventory action; record who
  // changed the order status, what it changed to, and the order id.
  // Best-effort: a failure here never surfaces to the merchant UI.
  const auditAction: AuditAction =
    to === "cancelled"
      ? "order.cancel"
      : to === "returned"
        ? "order.refund"
        : "settings.update";
  void recordAudit({
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: auditAction,
    resourceType: "order",
    resourceId: orderId,
    details: { from: "see orders table", to },
  });

  // Phase 6 — fire-and-forget status-change SMS to the customer. Non-blocking:
  // the merchant's UI already returned OK; SMS failures are isolated and never
  // surface as order-management errors. We re-fetch the row outside the txn so
  // we get the post-update state (tracking code, store name, phone, etc.).
  if (to === "shipped" || to === "delivered" || to === "cancelled") {
    try {
      const rows = await withTenant(auth.tenantId, auth.userId, (tx) =>
        tx<
          {
            order_number: number;
            total: string;
            payment_method: string;
            customer_name: string;
            customer_phone: string;
            tracking_code: string | null;
            store_name: string;
          }[]
        >`select o.order_number, o.total, o.payment_method,
                 c.name as customer_name, c.phone as customer_phone,
                 s.tracking_code,
                 t.name as store_name
            from orders o
            join customer c on c.id = o.customer_id
            join tenant t on t.id = o.tenant_id
            left join shipment s on s.order_id = o.id
           where o.id = ${orderId}
           limit 1`,
      );
      const r = rows[0];
      if (r) {
        // P1.4 — enqueue via Redis-backed queue instead of awaiting the
        // gateway inline. The merchant's UI returned OK the moment we
        // enqueued; the actual SMS fires 5–30s later on the background
        // drainer. Gateway timeouts NEVER block order completion.
        const { enqueueStatusSms } = await import("@/lib/sms/queue");
        await enqueueStatusSms(
          {
            storeName: r.store_name,
            orderNumber: r.order_number,
            total: Number(r.total),
            paymentMethod: r.payment_method === "bkash" ? "bkash" : "cod",
            customerName: r.customer_name,
            customerPhone: r.customer_phone,
            trackingCode: r.tracking_code,
          },
          to,
        );
      }
    } catch (err) {
      // Swallow — never let notification failure affect the API result.
      console.error("[updateOrderStatus] status SMS failed", err);
    }
  }

  return { ok: true };
}

// ---- Manual order entry ----------------------------------------------------
const ManualItem = z.object({
  variantId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(1000),
});

const ManualOrderInput = z.object({
  phone: z.string().trim().min(6, "সঠিক ফোন নম্বর দিন").max(20),
  name: z.string().trim().min(1, "গ্রাহকের নাম দিন").max(120),
  division: z.string().trim().min(1, "বিভাগ দিন").max(60),
  district: z.string().trim().min(1, "জেলা দিন").max(60),
  thana: z.string().trim().min(1, "থানা দিন").max(60),
  line: z.string().trim().max(300).optional().default(""),
  items: z.array(ManualItem).min(1, "অন্তত একটি পণ্য যোগ করুন"),
  paymentMethod: z.enum(["cod", "bkash"]).default("cod"),
  shippingTotal: z.coerce.number().min(0).max(100000).default(0),
  note: z.string().trim().max(1000).optional().default(""),
  // F-commerce source tagging (P3-3): manual phone/walk-in vs a chat order.
  source: z.enum(["manual", "messenger"]).default("manual"),
});

export interface ManualOrderResult extends ActionResult {
  orderId?: string;
  orderNumber?: number;
}

export async function createManualOrder(
  _prev: ManualOrderResult | null,
  formData: FormData,
): Promise<ManualOrderResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = ManualOrderInput.safeParse({
    phone: formData.get("phone"),
    name: formData.get("name"),
    division: formData.get("division"),
    district: formData.get("district"),
    thana: formData.get("thana"),
    line: formData.get("line") ?? "",
    items: readJson(formData.get("items")),
    paymentMethod: formData.get("paymentMethod") ?? "cod",
    shippingTotal: formData.get("shippingTotal") ?? 0,
    note: formData.get("note") ?? "",
    source: formData.get("source") ?? "manual",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  }
  const input = parsed.data;

  try {
    const result = await placeOrder({
      tenantId: auth.tenantId,
      userId: auth.userId,
      customer: { phone: input.phone, name: input.name },
      shippingAddress: {
        recipient: input.name,
        phone: input.phone,
        division: input.division,
        district: input.district,
        thana: input.thana,
        line: input.line,
      },
      items: input.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      paymentMethod: input.paymentMethod,
      note: input.note || null,
      source: input.source,
      shippingTotal: input.shippingTotal,
    });

    bustOrderTags(auth.tenantId, result.orderId);
    revalidateTag(`tenant:${auth.tenantId}:customers`);
    revalidateTag(`tenant:${auth.tenantId}:products`);
    return { ok: true, orderId: result.orderId, orderNumber: result.orderNumber };
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return { ok: false, error: "একটি পণ্যের পর্যাপ্ত স্টক নেই।" };
    }
    console.error("[createManualOrder] failed", error);
    return { ok: false, error: "অর্ডার তৈরি ব্যর্থ হয়েছে।" };
  }
}

/** Phone autofill for the manual form (DESIGN §P3.4). Returns null if no match. */
export async function lookupCustomer(phone: string): Promise<CustomerPrefill | null> {
  const auth = await authTenant();
  if (!auth.ok) return null;
  return findCustomerByPhone(auth.tenantId, auth.userId, phone);
}

export interface PickerVariant {
  variantId: string;
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  price: number;
  inventory: number;
  trackInventory: boolean;
}

/** Type-ahead product/variant search for the manual order picker (DESIGN §P3.4).
 *  Matches active products by title or SKU; returns sellable variants. */
export async function searchProductsForPicker(query: string): Promise<PickerVariant[]> {
  const auth = await authTenant();
  if (!auth.ok) return [];
  const q = query.trim();
  if (!q) return [];
  const like = `%${q}%`;

  const rows = await withTenant(auth.tenantId, auth.userId, (tx) =>
    tx<
      {
        variant_id: string;
        product_title: string;
        variant_title: string | null;
        sku: string | null;
        price: string;
        inventory_quantity: number;
        track_inventory: boolean;
      }[]
    >`
      select v.id as variant_id, p.title as product_title, v.title as variant_title,
             v.sku, v.price, v.inventory_quantity, v.track_inventory
      from product_variant v
      join product p on p.id = v.product_id
      where v.is_active = true and p.status = 'active'
        and (p.title ilike ${like} or v.sku ilike ${like})
      order by p.title asc, v.position asc
      limit 20
    `,
  );

  return rows.map((r) => ({
    variantId: r.variant_id,
    productTitle: r.product_title,
    variantTitle: r.variant_title,
    sku: r.sku,
    price: Number(r.price),
    inventory: r.inventory_quantity,
    trackInventory: r.track_inventory,
  }));
}

// ---- Manual refund (O22, sprint 1) ----------------------------------------
// Merchant-initiated refund outside the formal RMA flow — for goodwill
// refunds, shipping-fee corrections, "customer got damaged product" cases.
// Atomic: locks the order row, validates amount <= remaining balance, writes
// return_request(type='manual_refund'), updates orders.payment_status, audit log.

const ManualRefundSchema = z.object({
  orderId: z.string().uuid(),
  amount: z.coerce.number().positive().max(10_000_000),
  method: z.enum(["bkash", "nagad", "cash"]),
  reason: z.string().trim().min(1, "কারণ দিন").max(500),
  payoutReference: z.string().trim().max(120).optional().default(""),
  note: z.string().trim().max(1000).optional().default(""),
  restock: z.coerce.boolean().optional().default(false),
});

export async function createManualRefund(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = ManualRefundSchema.safeParse({
    orderId: formData.get("orderId"),
    amount: formData.get("amount"),
    method: formData.get("method"),
    reason: formData.get("reason"),
    payoutReference: formData.get("payoutReference") ?? "",
    note: formData.get("note") ?? "",
    restock: formData.get("restock") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  }
  const input = parsed.data;

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      // Lock the order row so a concurrent refund can't double-spend the balance.
      const rows = await tx<{
        payment_status: string;
        grand_total: string;
        refunded_total: string;
      }[]>`select payment_status, grand_total,
                coalesce((select sum(refund_amount) from return_request
                          where order_id = ${input.orderId}
                            and status in ('refunded','approved','completed')), 0) as refunded_total
           from orders where id = ${input.orderId} for update`;
      const order = rows[0];
      if (!order) throw new Error("ORDER_NOT_FOUND");
      if (!["paid", "partially_paid", "partially_refunded"].includes(order.payment_status)) {
        throw new Error("ORDER_NOT_REFUNDABLE");
      }
      const grandTotal = Number(order.grand_total);
      const alreadyRefunded = Number(order.refunded_total);
      const remaining = grandTotal - alreadyRefunded;
      if (input.amount > remaining + 0.01) {
        throw new Error("AMOUNT_EXCEEDS_BALANCE");
      }

      // Determine the new payment_status: fully refunded vs partially refunded.
      const isFullRefund = input.amount >= remaining - 0.01;
      const newStatus = isFullRefund ? "refunded" : "partially_refunded";

      // Write the refund row. Restock is merchant's call (UI checkbox) — we
      // record intent but the actual restock happens via the inventory
      // adjustment path (out of scope for O22 — see SPEC.md).
      await tx`
        insert into return_request
          (tenant_id, order_id, type, status, reason,
           refund_amount, refund_method, refunded_at,
           payout_reference, payout_at, initiated_by, note)
        values
          (${auth.tenantId}, ${input.orderId}, 'manual_refund', 'refunded',
           'other', ${input.amount}, ${input.method}::refund_method, now(),
           ${input.payoutReference || null}, now(), ${auth.userId}, ${input.note || null})
      `;

      // Update the order's payment status. approved_at is informational —
      // we already stamped refunded_at on the refund row above.
      await tx`
        update orders
           set payment_status = ${newStatus}::order_payment_status,
               updated_at = now()
         where id = ${input.orderId}
      `;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ORDER_NOT_FOUND") return { ok: false, error: "অর্ডার পাওয়া যায়নি।" };
    if (message === "ORDER_NOT_REFUNDABLE") {
      return { ok: false, error: "শুধু পরিশোধিত অর্ডার ফেরত দেওয়া যায়।" };
    }
    if (message === "AMOUNT_EXCEEDS_BALANCE") {
      return { ok: false, error: "ফেরতের পরিমাণ বাকি টাকার বেশি হতে পারে না।" };
    }
    console.error("[createManualRefund] failed", error);
    return { ok: false, error: "ফেরত প্রদান ব্যর্থ হয়েছে।" };
  }

  bustOrderTags(auth.tenantId, input.orderId);

  // Audit log — money out is the most important thing to track.
  const { recordAudit } = await import("@/lib/audit/record");
  void recordAudit({
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: "order.refund",
    resourceType: "order",
    resourceId: input.orderId,
    details: {
      amount: input.amount,
      method: input.method,
      reason: input.reason,
      payoutReference: input.payoutReference || null,
      restock: input.restock,
    },
  });

  // SMS to the customer — non-blocking via the existing queue.
  try {
    const { enqueueRefundSms } = await import("@/lib/sms/queue");
    void enqueueRefundSms({
      orderId: input.orderId,
      amount: input.amount,
      method: input.method,
      tenantId: auth.tenantId,
    });
  } catch (err) {
    console.warn("[createManualRefund] SMS enqueue failed (non-blocking)", err);
  }

  return { ok: true };
}

// ---- Edit order (O3, sprint 1) --------------------------------------------
// Merchant-initiated soft edit of an order's line items BEFORE it ships.
// Atomic: locks the order row, validates the order is still editable,
// recomputes line_totals + subtotal + grand_total in one txn, writes an
// order_edits audit row + an audit_log entry with before/after JSON.
//
// Restrictive by design: only qty + unit_price can be edited in v1. Adding
// "edit customer" / "edit shipping address" should land as separate flows
// so the audit trail stays coherent (a single order_edits row is one
// coherent change-set; mixing line-item edits with address edits would
// muddy that).

const EditOrderItemSchema = z.object({
  orderItemId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(1000).optional(),
  unitPrice: z.coerce.number().min(0).max(10_000_000).optional(),
});

const EditOrderSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().trim().min(1, "কারণ দিন").max(500),
  items: z.string().trim().min(1), // JSON-encoded array, parsed below
});

export interface EditOrderResult extends ActionResult {
  editSeq?: number;
  newGrandTotal?: number;
}

export async function submitEditOrder(
  _prev: EditOrderResult | null,
  formData: FormData,
): Promise<EditOrderResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = EditOrderSchema.safeParse({
    orderId: formData.get("orderId"),
    reason: formData.get("reason"),
    items: formData.get("items") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  }
  const input = parsed.data;

  let itemsParsed: Array<{ orderItemId: string; quantity?: number; unitPrice?: number }>;
  try {
    const raw = JSON.parse(input.items);
    if (!Array.isArray(raw)) throw new Error("not an array");
    const arr = z.array(EditOrderItemSchema).safeParse(raw);
    if (!arr.success) {
      return { ok: false, error: arr.error.issues[0]?.message ?? "পণ্যের ইনপুট ভুল।" };
    }
    itemsParsed = arr.data;
  } catch {
    return { ok: false, error: "পণ্যের তালিকা পড়া যাচ্ছে না।" };
  }

  try {
    const result = await editOrderCore(auth.tenantId, {
      orderId: input.orderId,
      actorUserId: auth.userId,
      reason: input.reason,
      items: itemsParsed,
    });
    bustOrderTags(auth.tenantId, input.orderId);
    revalidateTag(`tenant:${auth.tenantId}:dashboard`);

    // Audit log — order.update is the new action added in 31_o3_edit_order.sql.
    // details captures the touched items so a compliance review doesn't need
    // to join against order_edits.
    const { recordAudit } = await import("@/lib/audit/record");
    void recordAudit({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "order.update",
      resourceType: "order",
      resourceId: input.orderId,
      details: {
        reason: input.reason,
        editSeq: result.editSeq,
        newGrandTotal: result.newGrandTotal,
        editedItems: result.editedItems.map((ed) => ({
          orderItemId: ed.orderItemId,
          before: ed.before,
          after: ed.after,
        })),
      },
    });

    // Customer SMS — non-blocking via the existing queue. Sent AFTER the
    // txn commits so a notification failure never rolls back the edit.
    try {
      const { enqueueOrderEditedSms } = await import("@/lib/sms/queue");
      void enqueueOrderEditedSms({
        orderId: input.orderId,
        tenantId: auth.tenantId,
      }).catch((err) =>
        console.warn("[editOrder] SMS enqueue failed (non-blocking)", err),
      );
    } catch (err) {
      console.warn("[editOrder] SMS enqueue failed (non-blocking)", err);
    }

    return {
      ok: true,
      editSeq: result.editSeq,
      newGrandTotal: result.newGrandTotal,
    };
  } catch (err) {
    if (err instanceof EditOrderError) {
      // Map our stable codes to friendly Bengali error messages.
      const map: Record<EditOrderError["code"], string> = {
        ORDER_NOT_FOUND: "অর্ডার পাওয়া যায়নি।",
        ORDER_NOT_EDITABLE: "অর্ডার শিপ হওয়ার পরে আর এডিট করা যায় না।",
        ITEM_NOT_FOUND: "পণ্য পাওয়া যায়নি।",
        INVALID_QUANTITY: "পরিমাণ ১-১০০০ হতে হবে।",
        INVALID_PRICE: "দাম সঠিক নয়।",
        NO_CHANGES: "কোনো পরিবর্তন নেই।",
        REASON_REQUIRED: "কারণ দিন।",
      };
      return { ok: false, error: map[err.code] ?? err.message };
    }
    console.error("[editOrder] failed", err);
    return { ok: false, error: "অর্ডার এডিট ব্যর্থ হয়েছে।" };
  }
}

function readJson(value: FormDataEntryValue | null): unknown[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
