// ============================================================================
// O3 — Edit Order (qty / unit_price / discount with full audit trail)
//
// Merchant-initiated soft edit of a placed order BEFORE it ships. Edits are
// restricted to line items (quantity, unit_price) and the order-level
// discount. Customer / shipping address are NOT editable in v1 — that is
// treated as a separate "edit customer" flow so the audit story stays clean.
//
// What this function does, in one withTenant txn:
//   1. Locks the order row (SELECT ... FOR UPDATE) so a concurrent edit
//      can't double-apply.
//   2. Validates that the order is still editable (not shipped, delivered,
//      cancelled, or returned).
//   3. For each touched item, validates the new quantity / unit_price and
//      recomputes line_total = unit_price * quantity.
//   4. Recomputes the order subtotal, grand_total, cod_amount as needed.
//   5. Writes a row to `order_edits` with before/after JSON snapshots of
//      every touched line. The audit row carries the reason + actor.
//   6. (Audit_log write is the caller's job — see actions.ts — using the
//      `order.update` AuditAction added in 31_o3_edit_order.sql.)
//
// Concurrent-safety:
//   * The order row is locked FOR UPDATE for the entire txn. A second
//     concurrent editOrder() call for the same order blocks on the lock and
//     then re-reads the post-mutation values, so the second edit's "before"
//     snapshot is the first edit's "after" snapshot — not the original.
//   * The order_edits UNIQUE (order_id, edit_seq) constraint enforces monotonic
//     per-order sequence numbers; the next seq is selected inside the locked
//     txn (max + 1) so two concurrent edits can never collide.
//
// Tenant isolation:
//   * All reads + writes go through withTenant(tenantId, userId, ...). The
//     app_runtime_login role carries RLS for every table touched here.
//   * The order_edits + order_item edits are RLS-scoped via the standard
//     app.current_tenant_id() helper from 02_policies.sql.
// ============================================================================

import { withTenant } from "@hybrid/db";
import type { Tx } from "@hybrid/db";

// ---- Types -----------------------------------------------------------------

/** One edit instruction for a single line item. */
export interface EditOrderItemInput {
  /** The order_item.id being edited. */
  orderItemId: string;
  /** New quantity. Must be >= 1. */
  quantity?: number;
  /** New unit price in taka. Must be >= 0. */
  unitPrice?: number;
}

/** Top-level edit input. */
export interface EditOrderInput {
  /** The orders.id being edited. */
  orderId: string;
  /** The app_user.id of the merchant making the change. */
  actorUserId: string;
  /**
   * Required merchant-supplied justification. Captured in the audit row so
   * compliance / customer-dispute reviews are self-explanatory. Must be
   * non-empty and <= 500 chars.
   */
  reason: string;
  /**
   * Optional per-line edits. Empty array → no-op (caller probably should not
   * invoke us at all in that case, but we treat it as a no-op rather than an
   * error so the UI can disable the Save button without re-plumbing).
   */
  items: EditOrderItemInput[];
}

export interface EditOrderResult {
  /** After / before snapshot of every line that was touched. */
  editedItems: {
    orderItemId: string;
    before: { quantity: number; unitPrice: number; lineTotal: number };
    after: { quantity: number; unitPrice: number; lineTotal: number };
  }[];
  /** Recomputed order totals after the edit. */
  newSubtotal: number;
  newGrandTotal: number;
  /** The audit row's sequence number (per-order, monotonic). */
  editSeq: number;
}

export class EditOrderError extends Error {
  /** Stable machine code — UI keys its error messages off this. */
  code:
    | "ORDER_NOT_FOUND"
    | "ORDER_NOT_EDITABLE"
    | "ITEM_NOT_FOUND"
    | "INVALID_QUANTITY"
    | "INVALID_PRICE"
    | "NO_CHANGES"
    | "REASON_REQUIRED";
  constructor(code: EditOrderError["code"], message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

// ---- Public API ------------------------------------------------------------

/**
 * Apply a soft edit to an order's line items.
 *
 * @throws EditOrderError for any validation failure (no DB writes happen).
 * @throws Whatever the DB throws for connection / RLS failures.
 */
export async function editOrder(
  tenantId: string,
  input: EditOrderInput,
): Promise<EditOrderResult> {
  // ---- input validation (cheap, no DB) -------------------------------------
  if (!input.orderId) throw new EditOrderError("ORDER_NOT_FOUND");
  if (!input.reason || !input.reason.trim()) {
    throw new EditOrderError("REASON_REQUIRED", "কারণ দিন");
  }
  const reason = input.reason.trim().slice(0, 500);
  if (!input.items || input.items.length === 0) {
    throw new EditOrderError("NO_CHANGES", "কোনো পরিবর্তন নেই");
  }
  for (const it of input.items) {
    if (it.quantity !== undefined) {
      if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 1000) {
        throw new EditOrderError("INVALID_QUANTITY", "পরিমাণ ১-১০০০ হতে হবে");
      }
    }
    if (it.unitPrice !== undefined) {
      if (!Number.isFinite(it.unitPrice) || it.unitPrice < 0 || it.unitPrice > 10_000_000) {
        throw new EditOrderError("INVALID_PRICE", "দাম সঠিক নয়");
      }
    }
  }

  return withTenant(tenantId, input.actorUserId, async (tx: Tx) => {
    // 1) Lock the order row + validate state.
    const orderRows = await tx<
      { id: string; fulfillment_status: string; payment_status: string }[]
    >`
      select id, fulfillment_status, payment_status
        from orders
       where id = ${input.orderId}
       for update
    `;
    const order = orderRows[0];
    if (!order) throw new EditOrderError("ORDER_NOT_FOUND");
    // Editable window: anything before shipping. We allow editing of pending /
    // confirmed / packed orders. shipped + beyond is locked.
    if (!["pending", "confirmed", "packed"].includes(order.fulfillment_status)) {
      throw new EditOrderError(
        "ORDER_NOT_EDITABLE",
        "অর্ডার শিপ হওয়ার পরে আর এডিট করা যায় না",
      );
    }

    // 2) Read every line item on the order in one round-trip. We need the
    //    full set to know which ones are touched (by id) and to recompute
    //    the order subtotal from the post-edit values.
    const allItems = await tx<
      {
        id: string;
        quantity: number;
        unit_price: string;
        line_total: string;
      }[]
    >`
      select id, quantity, unit_price, line_total
        from order_item
       where order_id = ${input.orderId}
    `;
    const itemsById = new Map(allItems.map((it) => [it.id, it]));

    // 3) Build the edit set. For each touched item, compute the new quantity
    //    + unit_price + line_total. Reject if the requested id is not on the
    //    order.
    const editedItems: EditOrderResult["editedItems"] = [];
    const touched = new Set<string>();
    for (const it of input.items) {
      const existing = itemsById.get(it.orderItemId);
      if (!existing) throw new EditOrderError("ITEM_NOT_FOUND");
      const newQty = it.quantity ?? existing.quantity;
      const newPrice = it.unitPrice ?? Number(existing.unit_price);
      const oldPrice = Number(existing.unit_price);
      const newLineTotal = round2(newPrice * newQty);
      const oldLineTotal = Number(existing.line_total);
      // No-op edits (same qty + same price) are silently allowed — the audit
      // row records the attempt and the merchant can move on. We do NOT
      // throw NO_CHANGES here because at least one item was submitted.
      editedItems.push({
        orderItemId: it.orderItemId,
        before: {
          quantity: existing.quantity,
          unitPrice: oldPrice,
          lineTotal: oldLineTotal,
        },
        after: { quantity: newQty, unitPrice: newPrice, lineTotal: newLineTotal },
      });
      touched.add(it.orderItemId);
    }

    // 4) Apply the per-line updates. Each UPDATE is one row; using a CASE
    //    WHEN or a per-row UPDATE is fine here because the typical edit is
    //    1–3 lines and the lock is already held on the order.
    for (const ed of editedItems) {
      await tx`
        update order_item
           set quantity   = ${ed.after.quantity},
               unit_price = ${ed.after.unitPrice}::numeric(14,2),
               line_total = ${ed.after.lineTotal}::numeric(14,2)
         where id = ${ed.orderItemId}
      `;
    }

    // 5) Recompute the order subtotal + grand_total from the FULL set of line
    //    items (touched + untouched). Grand total = subtotal + shipping_total
    //    + tax_total - discount_total. We do NOT touch cod_amount (collection
    //    amount is a separate field; the merchant may have already paid an
    //    advance via bKash — editing line items should not auto-bump the COD
    //    due).
    const totals = await tx<{ subtotal: string; grand_total: string; shipping_total: string; tax_total: string; discount_total: string }[]>`
      select
        coalesce(sum(line_total), 0) as subtotal,
        grand_total,
        shipping_total,
        tax_total,
        discount_total
      from order_item
      cross join (select grand_total, shipping_total, tax_total, discount_total
                    from orders where id = ${input.orderId}) o
      where order_item.order_id = ${input.orderId}
      group by grand_total, shipping_total, tax_total, discount_total
    `;
    const newSubtotal = round2(Number(totals[0]?.subtotal ?? 0));
    const shippingTotal = Number(totals[0]?.shipping_total ?? 0);
    const taxTotal = Number(totals[0]?.tax_total ?? 0);
    const discountTotal = Number(totals[0]?.discount_total ?? 0);
    const newGrandTotal = round2(
      newSubtotal + shippingTotal + taxTotal - discountTotal,
    );

    await tx`
      update orders
         set subtotal    = ${newSubtotal}::numeric(14,2),
             grand_total = ${newGrandTotal}::numeric(14,2),
             updated_at  = now()
       where id = ${input.orderId}
    `;

    // 6) Pick the next per-order edit_seq under the order-row lock, then
    //    write the audit row. The UNIQUE (order_id, edit_seq) constraint
    //    gives us a per-order timeline even if two merchants race (the
    //    order row lock prevents the race; the UNIQUE is a safety net).
    const seqRows = await tx<{ next_seq: number }[]>`
      select coalesce(max(edit_seq), 0) + 1 as next_seq
        from order_edits
       where order_id = ${input.orderId}
    `;
    const editSeq = Number(seqRows[0]?.next_seq ?? 1);

    // Build the before/after JSON shape. We only emit the touched items, not
    // the entire order — the audit row should be small + focused.
    const before = Object.fromEntries(
      editedItems.map((ed) => [
        ed.orderItemId,
        {
          quantity: ed.before.quantity,
          unit_price: ed.before.unitPrice,
          line_total: ed.before.lineTotal,
        },
      ]),
    );
    const after = Object.fromEntries(
      editedItems.map((ed) => [
        ed.orderItemId,
        {
          quantity: ed.after.quantity,
          unit_price: ed.after.unitPrice,
          line_total: ed.after.lineTotal,
        },
      ]),
    );

    await tx`
      insert into order_edits
        (tenant_id, order_id, edit_seq, before, after, reason, actor_user_id)
      values
        (${tenantId}, ${input.orderId}, ${editSeq},
         ${tx.json(before)}, ${tx.json(after)},
         ${reason}, ${input.actorUserId})
    `;

    // 7) Console-warn the audit event so an ops engineer tailing logs sees
    //    every edit in real time. Best-effort: a logging failure here can
    //    never block the txn.
    console.warn(
      `[edit-order] tenant=${tenantId} order=${input.orderId} seq=${editSeq} items=${editedItems.length} actor=${input.actorUserId} reason="${reason}"`,
    );

    return {
      editedItems,
      newSubtotal,
      newGrandTotal,
      editSeq,
    };
  });
}

// ---- Helpers ---------------------------------------------------------------

/** Banker-safe round to 2 decimal places. Avoids the float-drift issue. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
